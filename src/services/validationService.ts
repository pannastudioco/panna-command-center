const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * Validates a YouTube Data API v3 key with a 1-unit, non-quota-intensive call.
 * Adapted from Reality Architect's services/validationService.ts.
 */
export const validateYoutubeApiKey = async (apiKey: string): Promise<void> => {
  const url = `${YOUTUBE_API_BASE_URL}/videos?part=id&id=dQw4w9WgXcQ&key=${apiKey}`;

  try {
    const response = await fetch(url);
    if (response.ok) return;

    const errorData = await response.json();
    const errorReason = errorData.error?.errors?.[0]?.reason;

    if (errorReason === 'keyInvalid') {
      throw new Error('API key is invalid.');
    }
    if (errorReason === 'accessNotConfigured') {
      throw new Error('YouTube Data API v3 is not enabled for this project.');
    }

    const errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
    throw new Error(errorMessage);
  } catch (error) {
    if (error instanceof Error) throw new Error(`Validation failed: ${error.message}`);
    throw new Error('Validation failed due to a network error.');
  }
};
