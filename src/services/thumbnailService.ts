/**
 * Client-side thumbnail post-processing (pure canvas, zero network, zero quota).
 *
 * Two jobs the image model can't do for us:
 *  1. EXACT SIZE — the Gemini image models return ~1MP 16:9 (~1344x768), not 1280x720.
 *     YouTube wants 1280x720 JPEG/PNG under 2MB, so we normalise + compress here.
 *  2. DUAL-THEME SAFETY — YouTube's dark theme sits on ~#0F0F0F and light on #FFFFFF, so a
 *     thumbnail with near-white edges dissolves into the light page and near-black edges
 *     dissolve into the dark one. We composite a double hairline border (1px white outside,
 *     1px black inside): on a light page the white blends but the black defines the edge; on
 *     a dark page the white defines it. The frame reads on BOTH themes.
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const MAX_BYTES = 2 * 1024 * 1024; // YouTube's thumbnails.set hard limit

export interface ProcessedThumbnail {
  /** 1280x720 JPEG data URL — safe to drop straight into an <img src>. */
  dataUrl: string;
  /** The bytes to hand to thumbnails.set. */
  blob: Blob;
  /** Mean relative luminance of the outer ring, 0..1. */
  edgeLuminance: number;
  /** True when the raw edges were near-white or near-black (the border is what saves it). */
  edgeRisk: boolean;
  sizeBytes: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar thumbnail.'));
    img.src = src;
  });
}

/** Mean relative luminance of the outer `ring` pixels — the dual-theme risk signal. */
function meanEdgeLuminance(ctx: CanvasRenderingContext2D, ring = 4): number {
  const strips = [
    ctx.getImageData(0, 0, CANVAS_W, ring), // top
    ctx.getImageData(0, CANVAS_H - ring, CANVAS_W, ring), // bottom
    ctx.getImageData(0, 0, ring, CANVAS_H), // left
    ctx.getImageData(CANVAS_W - ring, 0, ring, CANVAS_H), // right
  ];
  let total = 0;
  let count = 0;
  for (const strip of strips) {
    const d = strip.data;
    for (let i = 0; i < d.length; i += 4) {
      // Rec. 709 relative luminance, normalised 0..1.
      total += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0.5;
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal meng-encode thumbnail.'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Normalises any source image (data URL or object URL) into an upload-ready 1280x720 JPEG
 * with the dual-theme border applied. Center-crops to 16:9 rather than squashing.
 */
export async function processThumbnail(
  src: string,
  opts: { border?: boolean; vignette?: boolean } = {}
): Promise<ProcessedThumbnail> {
  const { border = true, vignette = true } = opts;
  const img = await loadImage(src);

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung di browser ini.');

  // Cover-fit: fill 1280x720 completely, cropping the overflow, never distorting.
  const scale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);

  // Measure the edges BEFORE we draw the border, so the reading describes the actual art.
  const edgeLuminance = meanEdgeLuminance(ctx);
  const edgeRisk = edgeLuminance > 0.92 || edgeLuminance < 0.08;

  if (vignette) {
    // Anchors the frame on a light page and pulls the eye to the centre. Subtle: 25% max.
    const g = ctx.createRadialGradient(
      CANVAS_W / 2,
      CANVAS_H / 2,
      Math.min(CANVAS_W, CANVAS_H) * 0.35,
      CANVAS_W / 2,
      CANVAS_H / 2,
      Math.max(CANVAS_W, CANVAS_H) * 0.75
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  if (border) {
    // Double hairline: whichever ring blends into the current theme, the other one defines
    // the boundary. The 0.5 offsets keep the 1px strokes crisp instead of anti-aliased.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(0.5, 0.5, CANVAS_W - 1, CANVAS_H - 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeRect(1.5, 1.5, CANVAS_W - 3, CANVAS_H - 3);
  }

  // Step quality down until we're under YouTube's 2MB ceiling.
  let quality = 0.92;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > MAX_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }
  if (blob.size > MAX_BYTES) throw new Error('Thumbnail masih di atas 2MB setelah dikompres.');

  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    blob,
    edgeLuminance,
    edgeRisk,
    sizeBytes: blob.size,
  };
}
