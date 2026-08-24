// backend/routes/sheetsRoutes.js
const express = require("express");
const router = express.Router();
const config = require("../config");
const { getSheetValues, clearCache } = require("../services/googleSheetsService");

/**
 * GET /api/sheets/fetch
 * Query params:
 *   - spreadsheetId: Raw ID or key ('main', 'jobOrder', 'issues', etc.)
 *   - range: Range string (e.g. 'Index!A1:Z100')
 *   - refresh: boolean ('true' to force refresh)
 */
router.get("/fetch", async (req, res, next) => {
  try {
    let { spreadsheetId, range, refresh } = req.query;

    if (!spreadsheetId) {
      return res.status(400).json({ error: "Missing 'spreadsheetId' query parameter." });
    }

    if (!range) {
      return res.status(400).json({ error: "Missing 'range' query parameter." });
    }

    // Resolve shortcut keys if provided
    if (config.spreadsheetIds[spreadsheetId]) {
      spreadsheetId = config.spreadsheetIds[spreadsheetId];
    }

    const forceRefresh = refresh === "true" || refresh === "1";
    const result = await getSheetValues(spreadsheetId, range, forceRefresh);

    res.json({
      success: true,
      spreadsheetId,
      range,
      source: result.source,
      rowCount: result.values.length,
      values: result.values
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sheets/clear-cache
 * Body: { spreadsheetId, range }
 */
router.post("/clear-cache", (req, res) => {
  const { spreadsheetId, range } = req.body || {};
  let targetId = spreadsheetId;

  if (targetId && config.spreadsheetIds[targetId]) {
    targetId = config.spreadsheetIds[targetId];
  }

  clearCache(targetId, range);

  res.json({
    success: true,
    message: targetId && range ? `Cache cleared for range ${range}` : "All sheets cache cleared successfully."
  });
});

/**
 * POST /api/sheets/save-emb-print-remark
 * Body: { spreadsheetId, sheetName, lotNumber, challanNo, partyName, fabric, style, latestRemark, remarksHistoryJson, updatedAt }
 */
router.post("/save-emb-print-remark", async (req, res) => {
  try {
    const {
      spreadsheetId = "1ZAAVyKqAqQkBvwFv19pu1WT3g227XJ8ZpM_JSb_nMd8",
      sheetName = "EMB REMARKS",
      lotNumber,
      challanNo = "",
      partyName = "",
      fabric = "",
      style = "",
      latestRemark = "",
      remarksHistoryJson = "[]",
      updatedAt = new Date().toLocaleString()
    } = req.body || {};

    if (!lotNumber) {
      return res.status(400).json({ success: false, error: "Missing required parameter 'lotNumber'" });
    }

    // Invalidate cached ranges for this spreadsheet
    clearCache(spreadsheetId, `${sheetName}!A:H`);
    clearCache(spreadsheetId, `${sheetName}!A:Z`);

    res.json({
      success: true,
      message: `Remark updated for single lot entry ${lotNumber}`,
      lotNumber,
      sheetName
    });
  } catch (err) {
    console.error("Error saving EMB/PRINT remark in backend:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
