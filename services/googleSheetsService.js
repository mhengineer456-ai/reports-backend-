// backend/services/googleSheetsService.js
const axios = require("axios");
const NodeCache = require("node-cache");
const config = require("../config");

// Initialize in-memory cache with standard TTL
const sheetsCache = new NodeCache({ stdTTL: config.cacheTTL, checkperiod: 120 });

/**
 * Fetch spreadsheet range values with caching support
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} range - Range string (e.g. "Index!A1:Z100" or "JobOrder")
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
 */
async function getSheetValues(spreadsheetId, range, forceRefresh = false) {
  if (!spreadsheetId || !range) {
    throw new Error("Missing required parameters: spreadsheetId or range");
  }

  const cacheKey = `${spreadsheetId}:${range}`;

  if (!forceRefresh) {
    const cachedData = sheetsCache.get(cacheKey);
    if (cachedData) {
      return { source: "cache", values: cachedData };
    }
  }

  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?key=${config.googleApiKey}`;

  try {
    const response = await axios.get(url);
    const values = response.data.values || [];
    
    // Store in cache
    sheetsCache.set(cacheKey, values);

    return { source: "network", values };
  } catch (error) {
    console.error(`Google Sheets API Error [${spreadsheetId} - ${range}]:`, error.message);
    
    // Fallback to stale cache if available
    const staleData = sheetsCache.get(cacheKey);
    if (staleData) {
      return { source: "stale_cache", values: staleData, error: error.message };
    }

    // Handle missing tabs or unparsed ranges gracefully for new/blank sheets
    if (error.response && (error.response.status === 400 || error.response.status === 404)) {
      console.warn(`[Graceful Fallback] Returning empty values for missing/unparsed range [${spreadsheetId} - ${range}]`);
      return { source: "empty_fallback", values: [] };
    }

    throw new Error(`Failed to fetch sheet values: ${error.response?.data?.error?.message || error.message}`);
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
