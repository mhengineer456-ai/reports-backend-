// backend/services/googleSheetsService.js
const axios = require("axios");
const NodeCache = require("node-cache");
const config = require("../config");

// Initialize in-memory cache with 300s (5 min) TTL to prevent Google Sheets 429 rate limits
const cacheTTL = config.cacheTTL && config.cacheTTL > 60 ? config.cacheTTL : 300;
const sheetsCache = new NodeCache({ stdTTL: cacheTTL, checkperiod: 120 });

// Map to deduplicate concurrent in-flight requests for the same spreadsheet range
const inFlightRequests = new Map();

/**
 * Sleep helper for retry backoff
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch spreadsheet range values with caching, deduplication & 429 retry
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} range - Range string (e.g. "Index!A1:Z100" or "JobOrder")
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
 */
async function getSheetValues(spreadsheetId, range, forceRefresh = false) {
  if (!spreadsheetId || !range) {
    throw new Error("Missing required parameters: spreadsheetId or range");
  }

  const cacheKey = `${spreadsheetId}:${range}`;

  // 1. Return from cache if available and not forced
  if (!forceRefresh) {
    const cachedData = sheetsCache.get(cacheKey);
    if (cachedData) {
      return { source: "cache", values: cachedData };
    }
  }

  // 2. Request deduplication: if identical request is already in-flight, await it
  if (inFlightRequests.has(cacheKey)) {
    try {
      const values = await inFlightRequests.get(cacheKey);
      return { source: "deduplicated", values };
    } catch (e) {
      // Continue to fetch on error
    }
  }

  const fetchPromise = (async () => {
    const encodedRange = encodeURIComponent(range);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?key=${config.googleApiKey}`;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await axios.get(url, { timeout: 45000 });
        const values = response.data.values || [];

        // Cache successful response
        sheetsCache.set(cacheKey, values);
        return values;
      } catch (error) {
        const isRateLimit = error.response && error.response.status === 429;
        const isNotFound = error.response && (error.response.status === 400 || error.response.status === 404);
        const isNetworkError = !error.response && (
          error.code === 'ENOTFOUND' || 
          error.code === 'ETIMEDOUT' || 
          error.code === 'ECONNRESET' || 
          error.code === 'ECONNABORTED' || 
          error.code === 'EAI_AGAIN'
        );

        if ((isRateLimit || isNetworkError) && attempts < maxAttempts) {
          const waitTime = attempts * 1500 + Math.floor(Math.random() * 500);
          console.warn(`[${isNetworkError ? 'Network/DNS Retry' : 'Rate Limit 429'}] Retrying [${spreadsheetId} - ${range}] in ${waitTime}ms (Attempt ${attempts}/${maxAttempts})...`);
          await sleep(waitTime);
          continue;
        }

        // Graceful empty fallback on missing tab or out-of-bounds range (400/404)
        if (isNotFound) {
          sheetsCache.set(cacheKey, []);
          return [];
        }

        console.error(`Google Sheets API Error [${spreadsheetId} - ${range}]:`, error.message);

        // Fallback to stale cache if available
        const staleData = sheetsCache.get(cacheKey);
        if (staleData) {
          console.warn(`[Fallback] Serving stale cache for [${spreadsheetId} - ${range}]`);
          return staleData;
        }

        // Graceful empty fallback on persistent rate limit to avoid breaking UI
        if (isRateLimit) {
          console.warn(`[Quota Fallback] Rate limit reached. Returning empty values gracefully.`);
          return [];
        }

        const customError = new Error(
          isNetworkError
            ? `Google Sheets Network/DNS Connection Error (${error.code || error.message}). Please check your internet connection.`
            : `Failed to fetch sheet values: ${error.response?.data?.error?.message || error.message}`
        );
        customError.status = isNetworkError ? 503 : (error.response?.status || 500);
        throw customError;
      }
    }
    return [];
  })();

  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    const values = await fetchPromise;
    return { source: "network", values };
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Clear specific key or clear entire cache
 */
function clearCache(spreadsheetId, range) {
  if (spreadsheetId && range) {
    sheetsCache.del(`${spreadsheetId}:${range}`);
  } else {
    sheetsCache.flushAll();
  }
}

module.exports = {
  getSheetValues,
  clearCache
};
