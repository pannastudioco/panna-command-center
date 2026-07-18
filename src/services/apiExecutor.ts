/**
 * Smart API key rotation with exhausted-key tracking and jittered backoff.
 * Adapted near-verbatim from Reality Architect's services/apiExecutor.ts.
 */

// Module-level round-robin counters (survives React re-renders)
const rotationIndices: Record<string, number> = {};

// Track keys that returned 429 with a cooldown timestamp
const exhaustedKeys: Record<string, Map<number, number>> = {};
const COOLDOWN_MS = 60_000; // Skip exhausted keys for 60s before retrying

const getNextAvailableIndex = (
  keys: string[],
  startIdx: number,
  namespace: string
): number => {
  const now = Date.now();
  const cooldownMap = exhaustedKeys[namespace];
  if (!cooldownMap || cooldownMap.size === 0) return startIdx % keys.length;

  for (let offset = 0; offset < keys.length; offset++) {
    const idx = (startIdx + offset) % keys.length;
    const cooldownUntil = cooldownMap.get(idx) || 0;
    if (now >= cooldownUntil) return idx;
  }
  return startIdx % keys.length;
};

export const executeApiCallWithRotation = async <T,>(
  apiCall: (key: string) => Promise<T>,
  keys: string[],
  startIndex?: number,
  serviceNamespace: string = 'youtube'
): Promise<{ result: T; nextKeyIndex: number }> => {
  if (!keys || keys.length === 0) throw new Error('No API keys provided.');

  if (rotationIndices[serviceNamespace] === undefined) {
    rotationIndices[serviceNamespace] = startIndex || 0;
  }
  if (!exhaustedKeys[serviceNamespace]) {
    exhaustedKeys[serviceNamespace] = new Map();
  }

  let keyIdx = getNextAvailableIndex(keys, rotationIndices[serviceNamespace], serviceNamespace);
  rotationIndices[serviceNamespace] = (keyIdx + 1) % keys.length;

  const maxAttempts = Math.min(keys.length * 2, 200);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = keys[keyIdx];
    try {
      const result = await apiCall(apiKey);
      return { result, nextKeyIndex: rotationIndices[serviceNamespace] };
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      const lower = errorMessage.toLowerCase();

      let errorCode: number | undefined;
      let errorStatus: string | undefined;
      try {
        const jsonStart = errorMessage.indexOf('{');
        const jsonEnd = errorMessage.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const body = JSON.parse(errorMessage.substring(jsonStart, jsonEnd + 1));
          errorCode = body?.error?.code || body?.code;
          errorStatus = body?.error?.status || body?.status;
        }
      } catch {
        // not a JSON-bearing error message; ignore
      }

      const isQuota =
        lower.includes('quota') ||
        lower.includes('429') ||
        lower.includes('resource_exhausted') ||
        errorCode === 429 ||
        errorStatus === 'RESOURCE_EXHAUSTED';

      const isInvalidKey =
        lower.includes('api key not valid') ||
        lower.includes('keyinvalid') ||
        lower.includes('unauthorized') ||
        lower.includes('forbidden');

      const isNetwork =
        lower.includes('failed to fetch') ||
        lower.includes('networkerror') ||
        lower.includes('rpc failed') ||
        lower.includes('500') ||
        lower.includes('503');

      if (isQuota) {
        exhaustedKeys[serviceNamespace].set(keyIdx, Date.now() + COOLDOWN_MS);
        console.warn(`[API:${serviceNamespace}] Key #${keyIdx} quota hit. Cooldown 60s. (attempt ${attempt + 1}/${maxAttempts})`);

        keyIdx = getNextAvailableIndex(keys, keyIdx + 1, serviceNamespace);
        rotationIndices[serviceNamespace] = (keyIdx + 1) % keys.length;

        const cycleNumber = Math.floor(attempt / keys.length);
        if (cycleNumber > 0) {
          const backoff = Math.min(1000 * Math.pow(2, cycleNumber - 1), 30000);
          const jitter = Math.random() * 1000;
          await new Promise((r) => setTimeout(r, backoff + jitter));
        } else {
          await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
        }
      } else if (isInvalidKey) {
        exhaustedKeys[serviceNamespace].set(keyIdx, Date.now() + 24 * 60 * 60 * 1000);
        console.warn(`[API:${serviceNamespace}] Key #${keyIdx} invalid. Skipping permanently.`);
        keyIdx = getNextAvailableIndex(keys, keyIdx + 1, serviceNamespace);
      } else if (isNetwork) {
        console.warn(`[API:${serviceNamespace}] Network error. Retrying in ${attempt + 1}s...`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        if (attempt % 3 === 2) {
          keyIdx = (keyIdx + 1) % keys.length;
        }
      } else {
        throw e;
      }

      if (attempt === maxAttempts - 1) {
        throw new Error(`All ${keys.length} API keys exhausted after ${maxAttempts} attempts. Last error: ${errorMessage}`);
      }
    }
  }
  throw new Error('All API keys failed.');
};
