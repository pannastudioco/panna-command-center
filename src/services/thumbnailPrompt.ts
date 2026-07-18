/**
 * Nano Banana (Gemini image) prompt builder for YouTube thumbnails.
 *
 * Built with the prompt-master discipline: the make-or-break constraints (dual-theme edge
 * safety + subject containment) sit in the FIRST 30% of the prompt so they survive attention
 * decay, every rule uses MUST/NEVER rather than "should/avoid", and nothing here is decorative.
 *
 * Gemini's image models are prose-driven (like DALL-E 3), NOT comma-tag driven like Midjourney —
 * so this is written as directed prose, not a keyword salad.
 */

/** Per-market thumbnail text density. Validated by the 2026 localisation research: Japanese
 * thumbnails are legitimately text-dense (holistic info-scanning), Western/Nordic/Dutch are
 * minimal single-focus, Korea/France skew soft-aesthetic. Getting this wrong is what makes a
 * localised thumbnail look imported. */
function textStyleFor(market: string | null): string {
  switch (market) {
    case 'ja':
      return (
        'Render the text in the dense Japanese thumbnail convention: thick Gothic sans-serif at its ' +
        'heaviest weight, DOUBLE outline plus a drop shadow, red/yellow/white high-contrast accents, ' +
        'bracket-tagged with full-width 【】 marks. Denser than a Western thumbnail is correct here.'
      );
    case 'ko':
    case 'fr':
      return (
        'Render the text in a soft aesthetic-mood style: elegant bold sans-serif, restrained, with a ' +
        'clean outline. Let the atmosphere of the scene carry more weight than the lettering.'
      );
    case 'id':
      return (
        'Render the text in the bold expressive Indonesian style: very heavy sans-serif, high-energy, ' +
        'thick outline, warm high-contrast accent colours. Punchy and immediately readable.'
      );
    default:
      return (
        'Render the text in the minimal Western style: ONE very large, bold, geometric sans-serif ' +
        'block with a thick contrasting outline. Nothing decorative.'
      );
  }
}

export interface ThumbnailPromptInput {
  scene: string;
  /** 1-4 words of on-image text, or empty for a pure-ambience thumbnail. */
  text: string;
  palette: string;
  market: string | null;
  /** 'photoreal' for real people/places, 'illustrated' for lofi/ambience scenes. */
  style?: 'photoreal' | 'illustrated';
}

/**
 * Assembles the final image prompt. Filled programmatically from the concept Gemini returns,
 * so the art direction stays creative while the physics of the thumbnail stay locked.
 */
export function buildThumbnailPrompt({
  scene,
  text,
  palette,
  market,
  style = 'photoreal',
}: ThumbnailPromptInput): string {
  const trimmed = text.trim();
  const textBlock = trimmed
    ? `Include exactly this text, spelled EXACTLY as written, and no other words: "${trimmed}". ` +
      `It MUST be legible when the whole image is shrunk to 168x94 pixels. ${textStyleFor(market)}`
    : 'Include NO text, NO letters, NO numbers and NO logos anywhere in the image. The scene alone must carry it.';

  const styleBlock =
    style === 'illustrated'
      ? 'Render as a warm, cohesive digital illustration with clean shapes and deliberate lighting — not a photo.'
      : // Maximum photorealism: describe it as a real photograph in physical, camera-grounded
        // terms. Prose, not tags — Gemini image models respond to directed description. The
        // shallow depth of field doubles as subject separation, reinforcing hard-constraint #2.
        'Render as a genuine PHOTOGRAPH — indistinguishable from a real photo, NOT an illustration, ' +
        'painting, or 3D render. It MUST look captured on a full-frame camera with a fast prime lens ' +
        '(an ~85mm portrait perspective for a person; a ~35mm perspective for a wide scene) at a wide ' +
        'aperture. Use natural directional lighting with soft, physically-accurate shadows and gentle ' +
        'highlight roll-off; true-to-life colour with NO plastic over-saturation. Resolve fine authentic ' +
        'micro-texture: visible skin pores, fine hair, and subsurface scattering on people; real material ' +
        'grain, fabric weave, and surface wear on objects. Use a shallow depth of field with natural ' +
        'optical bokeh so the subject sits crisply in focus against a gently blurred background. Keep ' +
        'subtle real-world imperfections — faint sensor grain, natural asymmetry, realistic reflections — ' +
        'so it reads as an unretouched real photograph. NEVER a video-game render, CGI, cartoon, anime, ' +
        'digital painting, or "AI art" look; NEVER waxy, plastic, airbrushed, or over-smoothed skin; ' +
        'NEVER flat, over-sharpened, or plastic-looking surfaces.';

  return [
    'Create a YouTube thumbnail. Landscape 16:9.',
    '',
    'HARD CONSTRAINTS — these override every other instruction in this prompt:',
    '1. The background MUST be a single saturated MID-TONE colour (relative luminance roughly 0.30-0.60). ' +
      'NEVER pure white, NEVER pure black, and NEVER near-white or near-black at the four edges. This image ' +
      'is displayed on BOTH a #FFFFFF page and a #0F0F0F page and MUST stay clearly bounded on both.',
    '2. There MUST be exactly ONE focal subject, fully contained inside the frame, with a crisp readable ' +
      'silhouette and a subtle rim light separating it from the background. The subject MUST NEVER bleed, ' +
      'fade, or blur into the frame edge.',
    '3. Keep the outer 10% margin free of the subject and any text. The TOP-RIGHT and BOTTOM-RIGHT corners ' +
      'MUST stay visually empty — YouTube overlays interface elements there.',
    '4. There MUST be high local contrast between background, subject, and any text — three clearly distinct ' +
      'brightness layers.',
    '',
    `SCENE: ${scene}`,
    `COLOUR PALETTE: ${palette}`,
    `STYLE: ${styleBlock}`,
    '',
    `TEXT: ${textBlock}`,
    '',
    'Do not add any words, letters, logos, watermarks, borders or UI elements beyond what is specified above.',
  ].join('\n');
}
