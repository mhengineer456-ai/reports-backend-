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

/**
 * GET /api/sheets/barcode
 * Fetch raw or parsed Barcode Data (LotBarcodeData)
 */
router.get("/barcode", async (req, res, next) => {
  try {
    const { refresh } = req.query;
    const barcodeSpreadsheetId = config.spreadsheetIds.barcode || "1dOCjNFwaAel5qun0_ZJVIGmREqjI76CJBBFIjM3NHv8";
    const range = req.query.range || "LotBarcodeData!A:Z";
    const forceRefresh = refresh === "true" || refresh === "1";

    const result = await getSheetValues(barcodeSpreadsheetId, range, forceRefresh);
    res.json({
      success: true,
      spreadsheetId: barcodeSpreadsheetId,
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
 * GET /api/sheets/packing-complete-lots
 * Fetches completed packing lots with packing complete dates
 */
router.get("/packing-complete-lots", async (req, res, next) => {
  try {
    const { refresh } = req.query;
    const forceRefresh = refresh === "true" || refresh === "1";

    const mainId = config.spreadsheetIds.main || "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA";
    const issuesId = config.spreadsheetIds.issues || "1uo14nKO_yHu4AJ2rOgaJajuprcinj6xw1AUMFJ6_zYM";
    const barcodeId = config.spreadsheetIds.barcode || "1dOCjNFwaAel5qun0_ZJVIGmREqjI76CJBBFIjM3NHv8";
    const rawpackId = config.spreadsheetIds.rawpack || "1xD8Uy1lUgvNTQ2RGRBI4ZjOrozbinUPRq2_UfIplP98";

    const [indexRes, issuesRes, barcodeRes, rawpackRes] = await Promise.all([
      getSheetValues(mainId, "Index!A:AA", forceRefresh).catch(() => ({ values: [] })),
      getSheetValues(issuesId, "Issues!A:R", forceRefresh).catch(() => ({ values: [] })),
      getSheetValues(barcodeId, "LotBarcodeData!A:Z", forceRefresh).catch(() => ({ values: [] })),
      getSheetValues(rawpackId, "RAWPACK!A:ZZ", forceRefresh).catch(() => ({ values: [] }))
    ]);

    res.json({
      success: true,
      indexCount: indexRes.values.length,
      issuesCount: issuesRes.values.length,
      barcodeCount: barcodeRes.values.length,
      rawpackCount: rawpackRes.values.length,
      data: {
        indexRows: indexRes.values,
        issuesRows: issuesRes.values,
        barcodeRows: barcodeRes.values,
        rawpackRows: rawpackRes.values
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sheets/cancelled-lots
 * Fetches only cancelled lots directly from JobOrder sheet
 */
router.get("/cancelled-lots", async (req, res, next) => {
  try {
    const { refresh } = req.query;
    const forceRefresh = refresh === "true" || refresh === "1";
    const jobOrderSpreadsheetId = config.spreadsheetIds.jobOrder || "1fKSwGBIpzWEFk566WRQ4bzQ0anJlmasoY8TwrTLQHXI";
    const range = req.query.range || "JobOrder!A1:AZ50000";

    const result = await getSheetValues(jobOrderSpreadsheetId, range, forceRefresh);
    const rows = result.values || [];

    if (rows.length === 0) {
      return res.json({ success: true, count: 0, data: [], headers: [] });
    }

    const headers = rows[0].map((h) => String(h || "").trim());
    const normalize = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    const headerMap = {};
    headers.forEach((h, idx) => {
      headerMap[normalize(h)] = idx;
    });

    const getVal = (row, key) => {
      const idx = headerMap[normalize(key)];
      return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : "";
    };

    const statusIdx = headerMap["status"];
    const cancelledLots = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const statusVal = statusIdx !== undefined ? String(row[statusIdx] || "").trim() : "";
      const normStatus = statusVal.toLowerCase();

      if (normStatus.includes("cancel")) {
        const item = {
          rowIndex: i + 1,
          jobOrderNo: getVal(row, "Job Order No") || getVal(row, "JobOrderNo") || getVal(row, "Order No"),
          date: getVal(row, "Date"),
          fabric: getVal(row, "Fabric"),
          brand: getVal(row, "Brand"),
          shade: getVal(row, "Shade"),
          size: getVal(row, "Size"),
          quantity: getVal(row, "Quantity"),
          unit: getVal(row, "Unit"),
          partyName: getVal(row, "Party Name") || getVal(row, "Party"),
          garmentType: getVal(row, "Garment Type") || getVal(row, "Garment"),
          section: getVal(row, "Section"),
          season: getVal(row, "Season"),
          emb: getVal(row, "Emb"),
          embDetails: getVal(row, "Emb Details"),
          printing: getVal(row, "Printing"),
          printingDetails: getVal(row, "Printing Details"),
          pattern: getVal(row, "Pattern"),
          style: getVal(row, "Style"),
          remarks: getVal(row, "Remarks"),
          directStitching: getVal(row, "Direct Stitching"),
          submittedBy: getVal(row, "Submitted By"),
          imageUrl: getVal(row, "Image URL") || getVal(row, "Image"),
          lotNumber: getVal(row, "Lot Number") || getVal(row, "Lot No") || getVal(row, "Lot"),
          component: getVal(row, "Component"),
          challanNo: getVal(row, "Challan No"),
          challanDate: getVal(row, "Challan Date"),
          challanItemsJson: getVal(row, "Challan Items JSON"),
          challanHistoryJson: getVal(row, "Challan History JSON"),
          challanTotalQty: getVal(row, "Challan Total Qty"),
          challanCompleteLot: getVal(row, "Challan Complete Lot"),
          challanBy: getVal(row, "Challan By"),
          challanPdfUrl: getVal(row, "Challan PDF URL"),
          priority: getVal(row, "Priority"),
          cancellationTimestamp: getVal(row, "Cancellation Timestamp") || getVal(row, "Cancelled At") || getVal(row, "Cancel Timestamp"),
          cancelledBy: getVal(row, "Cancelled By"),
          cancellationApprovedFrom: getVal(row, "Cancellation Approved From") || getVal(row, "Approved By"),
          cancellationReason: getVal(row, "Cancellation Reason") || getVal(row, "Reason"),
          status: statusVal || "Cancel"
        };
        cancelledLots.push(item);
      }
    }

    res.json({
      success: true,
      count: cancelledLots.length,
      source: result.source,
      data: cancelledLots,
      headers: headers
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sheets/hold-lots
 * Fetches all hold lots from the dedicated Hold Lots Spreadsheet (1oBetbe44z2lUXngctvk3J31WBiWTv07NIgx5jFlylOs)
 */
/**
 * GET /api/sheets/hold-lots
 * Fetches all hold lots from the dedicated Hold Lots Spreadsheet (1oBetbe44z2lUXngctvk3J31WBiWTv07NIgx5jFlylOs)
 */
router.get("/hold-lots", async (req, res, next) => {
  try {
    const { refresh, department } = req.query;
    const forceRefresh = refresh === "true" || refresh === "1";
    const holdSpreadsheetId = config.spreadsheetIds.holdLots || "1oBetbe44z2lUXngctvk3J31WBiWTv07NIgx5jFlylOs";
    
    // Candidate tab names to check
    const candidateTabs = [
      "All Holds",
      "Sheet1",
      "Stitching",
      "Cutting",
      "Embroidery",
      "Printing",
      "Washing",
      "Finishing",
      "Packing",
      "Hold lot",
      "Hold Lot",
      "Hold Lots",
      "Hold lots",
      "Hold"
    ];

    if (department && department.trim()) {
      const cleanDept = department.trim().replace(/Department/gi, "").trim();
      candidateTabs.unshift(cleanDept);
    }

    // Deduplicate candidate tabs
    const uniqueTabs = Array.from(new Set(candidateTabs));
    
    // Fetch from all potential tabs in parallel
    const tabPromises = uniqueTabs.map(async (tab) => {
      try {
        const range = `${tab}!A1:Z5000`;
        const resData = await getSheetValues(holdSpreadsheetId, range, forceRefresh);
        const rows = resData.values || [];
        if (rows.length > 1) {
          return { tab, rows, source: resData.source };
        }
      } catch (err) {
        // Silently skip tabs that don't exist
      }
      return null;
    });

    const results = (await Promise.all(tabPromises)).filter(Boolean);

    const holdsMap = new Map();
    let allHeaders = [];

    for (const result of results) {
      const rows = result.rows;
      if (!rows || rows.length <= 1) continue;

      const headers = rows[0].map((h) => String(h || "").trim());
      if (allHeaders.length === 0) allHeaders = headers;

      const normalize = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const headerMap = {};
      headers.forEach((h, idx) => {
        headerMap[normalize(h)] = idx;
      });

      const getVal = (row, key) => {
        const idx = headerMap[normalize(key)];
        return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : "";
      };

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Extract lot number
        let lotNo = getVal(row, "Lot Number") || getVal(row, "Lot No") || getVal(row, "Lot");
        if (!lotNo && row[3]) lotNo = String(row[3]).trim();
        // If row doesn't have lot number or timestamp or id, skip
        if (!lotNo && !row[0] && !row[1]) continue;
        if (String(lotNo).toLowerCase() === "lot number" || String(row[0]).toLowerCase() === "timestamp") continue;

        let holdId = getVal(row, "Hold ID") || getVal(row, "ID") || row[1] || `HOLD-${i}`;
        let dept = getVal(row, "Department") || getVal(row, "Dept") || row[2] || result.tab;
        let jobOrderNo = getVal(row, "Job Order No") || getVal(row, "JO") || row[4] || "—";
        let date = getVal(row, "PO Date") || getVal(row, "Date") || row[5] || "";
        let partyName = getVal(row, "Party Name") || getVal(row, "Party") || row[6] || "—";
        let brand = getVal(row, "Brand") || row[7] || "—";
        let style = getVal(row, "Style") || row[8] || "—";
        let fabric = getVal(row, "Fabric") || row[9] || "—";
        let quantity = getVal(row, "Quantity") || getVal(row, "Qty") || row[10] || "0";
        let unit = getVal(row, "Unit") || row[11] || "PCS";
        let shade = getVal(row, "Shade") || getVal(row, "Color") || row[12] || "—";
        let size = getVal(row, "Size") || row[13] || "—";
        let reason = getVal(row, "Hold Reason") || getVal(row, "Reason") || getVal(row, "Remarks") || row[14] || "";
        let location = getVal(row, "Location") || getVal(row, "Hold Location") || getVal(row, "Placement") || getVal(row, "Floor") || "";
        let holdBy = getVal(row, "Hold By") || getVal(row, "Held By") || "";
        let approvedBy = getVal(row, "Approved By") || getVal(row, "Approval By") || "";
        let priority = getVal(row, "Priority") || getVal(row, "Urgency") || "";
        let status = getVal(row, "Status") || "";
        let releasedAt = getVal(row, "Released At") || getVal(row, "Release Date") || "";
        let releasedBy = getVal(row, "Released By") || getVal(row, "Release By") || "";

        // Heuristic fallback for shifted columns (e.g., when Location/Floor is between Reason and Hold By)
        for (let colIdx = 14; colIdx < row.length; colIdx++) {
          const val = String(row[colIdx] || "").trim();
          if (!val) continue;
          const valUpper = val.toUpperCase();
          if (valUpper === "ON HOLD" || valUpper === "RELEASED" || valUpper === "HOLD" || valUpper === "ACTIVE") {
            if (!status || status === "ON HOLD") status = valUpper === "RELEASED" ? "RELEASED" : "ON HOLD";
          } else if (
            valUpper.includes("ALERT") ||
            valUpper.includes("STANDARD") ||
            valUpper.includes("CRITICAL") ||
            valUpper.includes("URGENT") ||
            valUpper.includes("HIGH") ||
            valUpper.includes("NORMAL")
          ) {
            if (!priority) priority = val;
          } else if (valUpper.includes("FLOOR") || valUpper.includes("FLR") || valUpper.includes("RACK") || valUpper.includes("TABLE")) {
            if (!location) location = val;
          }
        }

        if (!location && row[15]) location = String(row[15]).trim();
        if (!holdBy && row[16]) holdBy = String(row[16]).trim();
        if (!approvedBy && row[17]) approvedBy = String(row[17]).trim();
        if (!priority) priority = row[18] ? String(row[18]).trim() : "Standard Update";
        if (!status) status = row[19] ? String(row[19]).trim() : "ON HOLD";

        const cleanStatus = status.toUpperCase().includes("HOLD") ? "ON HOLD" : "RELEASED";

        const key = `${holdId}_${lotNo}`.toLowerCase();
        if (!holdsMap.has(key)) {
          holdsMap.set(key, {
            id: holdId,
            timestamp: getVal(row, "Timestamp") || row[0] || "",
            department: dept,
            lotNumber: lotNo,
            jobOrderNo: jobOrderNo,
            date: date,
            poDate: date,
            partyName: partyName,
            brand: brand,
            style: style,
            fabric: fabric,
            quantity: quantity,
            unit: unit,
            shade: shade,
            size: size,
            reason: reason,
            location: location || "—",
            holdBy: holdBy || "—",
            approvedBy: approvedBy || "—",
            priority: priority || "Standard Update",
            status: cleanStatus,
            releasedAt: releasedAt,
            releasedBy: releasedBy,
            tabOrigin: result.tab
          });
        }
      }
    }

    const allHolds = Array.from(holdsMap.values());

    res.json({
      success: true,
      count: allHolds.length,
      data: allHolds.reverse(),
      headers: allHeaders
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sheets/hold-lot
 * Append hold lot via Apps Script webhook to HOLD LOT ACTION spreadsheet
 */
router.post("/hold-lot", async (req, res, next) => {
  try {
    const holdData = req.body || {};
    const webhookUrl = config.holdLotsWebhookUrl || process.env.REACT_APP_HOLD_LOTS_WEBHOOK_URL;

    if (webhookUrl) {
      const axios = require("axios");
      await axios.post(webhookUrl, { action: "add_hold", ...holdData }, {
        headers: { "Content-Type": "text/plain;charset=utf-8" }
      });
    }

    // Invalidate cached hold lots range
    const holdSpreadsheetId = config.spreadsheetIds.holdLots || "1oBetbe44z2lUXngctvk3J31WBiWTv07NIgx5jFlylOs";
    clearCache(holdSpreadsheetId);

    res.json({
      success: true,
      message: "Hold lot recorded successfully in department sheet",
      holdData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sheets/release-hold
 * Release a lot from hold via Apps Script webhook
 */
router.post("/release-hold", async (req, res, next) => {
  try {
    const { holdId, lotNumber, department, releasedBy } = req.body || {};
    const webhookUrl = config.holdLotsWebhookUrl || process.env.REACT_APP_HOLD_LOTS_WEBHOOK_URL;

    if (webhookUrl) {
      const axios = require("axios");
      await axios.post(webhookUrl, {
        action: "release_hold",
        id: holdId,
        lotNumber,
        department,
        releasedBy: releasedBy || "Authorized Head"
      }, {
        headers: { "Content-Type": "text/plain;charset=utf-8" }
      });
    }

    const holdSpreadsheetId = config.spreadsheetIds.holdLots || "1oBetbe44z2lUXngctvk3J31WBiWTv07NIgx5jFlylOs";
    clearCache(holdSpreadsheetId);

    res.json({
      success: true,
      message: `Lot ${lotNumber} released from hold successfully`,
      holdId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sheets/department-data
 * Query params:
 *   - department: string (e.g. 'KajButton', 'Overlock', 'Folding', 'Jaybir Embroidery', 'Jaybir Printing', 'Washing', 'Elastic', or 'all')
 *   - refresh: boolean ('true' to force refresh)
 */
router.get("/department-data", async (req, res, next) => {
  try {
    const { department = "KajButton", refresh } = req.query;
    const forceRefresh = refresh === "true" || refresh === "1";
    const dailyStitchingSpreadsheetId = config.spreadsheetIds.dailyStitching || "1IMhmYlJ3s2PPRgEQs1Ikd4O1OBXK4EYL1oV_-kWAkyg";
    const holdSpreadsheetId = config.spreadsheetIds.holdLots || "1oBetbe44z2lUXngctvk3J31WBiWTv07NIgx5jFlylOs";

    const normKey = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    const DEPARTMENT_MAP = {
      kajbutton: { tab: "KajButton", range: "KajButton!A:Z" },
      overlock: { tab: "Overlock", range: "Overlock!A:Z" },
      folding: { tab: "Folding", range: "Folding!A:Z" },
      jaybiremb: { tab: "Jaybir Embroidery", range: "'Jaybir Embroidery'!A:Z" },
      jaybirembroidery: { tab: "Jaybir Embroidery", range: "'Jaybir Embroidery'!A:Z" },
      jaybirprinting: { tab: "Jaybir Printing", range: "'Jaybir Printing'!A:Z" },
      washing: { tab: "Washing", range: "Washing!A:Z" },
      elastic: { tab: "Elastic", range: "Elastic!A:Z" },
      feedup: { tab: "FeedUp", range: "FeedUp!A:Z" },
      feed: { tab: "FeedUp", range: "FeedUp!A:Z" }
    };

    const targetKey = normKey(department);
    const deptConfig = DEPARTMENT_MAP[targetKey] || { tab: department, range: `'${department}'!A:Z` };

    // Helper to find column indices
    const findCol = (headers, keywords) => {
      if (!Array.isArray(headers)) return -1;
      const cleanKw = keywords.map(k => normKey(k));
      for (let i = 0; i < headers.length; i++) {
        const h = normKey(headers[i]);
        if (cleanKw.includes(h)) return i;
      }
      for (let i = 0; i < headers.length; i++) {
        const h = normKey(headers[i]);
        if (cleanKw.some(k => h.includes(k))) return i;
      }
      return -1;
    };

    // Helper to parse completion date
    const parseCompDate = (raw) => {
      if (!raw || raw === "[]" || raw === "-") return "";
      const s = String(raw).trim();
      if (s.startsWith("[") || s.startsWith("{")) {
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const last = parsed[parsed.length - 1];
            return last.timestamp || last.date || last.completionDate || last.completedDate || "";
          } else if (parsed && typeof parsed === "object") {
            return parsed.timestamp || parsed.date || parsed.completionDate || "";
          }
        } catch (e) {
          // not valid JSON, use raw
        }
      }
      return s;
    };

    // Helper to parse WIP remarks & issue detection
    const parseWipInfo = (rawWip, rawComp) => {
      let remarks = "";
      let hasIssue = false;

      const checkTextForIssue = (txt) => {
        if (!txt) return false;
        const lower = String(txt).toLowerCase();
        return (
          lower.includes("hold") ||
          lower.includes("issue") ||
          lower.includes("fault") ||
          lower.includes("defect") ||
          lower.includes("rework") ||
          lower.includes("missing") ||
          lower.includes("delay") ||
          lower.includes("problem") ||
          lower.includes("kaaj pending") ||
          lower.includes("kaj pending") ||
          lower.includes("button pending")
        );
      };

      if (rawWip && rawWip !== "[]") {
        const s = String(rawWip).trim();
        if (s.startsWith("[") || s.startsWith("{")) {
          try {
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const last = parsed[parsed.length - 1];
              remarks = last.remarks || last.status || last.updateType || "";
            }
          } catch (e) {
            remarks = s;
          }
        } else {
          remarks = s;
        }
      }

      hasIssue = checkTextForIssue(remarks);

      return { remarks, hasIssue };
    };

    // Fetch department sheet and active Hold Lots sheet in parallel
    const [deptResult, holdResult] = await Promise.all([
      getSheetValues(dailyStitchingSpreadsheetId, deptConfig.range, forceRefresh).catch(err => {
        console.warn(`[Department Data] Failed to fetch ${deptConfig.range}:`, err.message);
        return { values: [] };
      }),
      getSheetValues(holdSpreadsheetId, "All Holds!A1:U2000", forceRefresh).catch(() => ({ values: [] }))
    ]);

    // Build hold lot map for the department
    const holdMap = new Map();
    const holdRows = holdResult.values || [];
    if (holdRows.length > 1) {
      const holdHeaders = holdRows[0].map(h => normKey(h));
      const hLotIdx = holdHeaders.indexOf("lotnumber") >= 0 ? holdHeaders.indexOf("lotnumber") : 3;
      const hDeptIdx = holdHeaders.indexOf("department") >= 0 ? holdHeaders.indexOf("department") : 2;
      const hReasonIdx = holdHeaders.indexOf("holdreason") >= 0 ? holdHeaders.indexOf("holdreason") : 14;
      const hStatusIdx = holdHeaders.indexOf("status") >= 0 ? holdHeaders.indexOf("status") : 18;

      for (let i = 1; i < holdRows.length; i++) {
        const row = holdRows[i];
        if (!row || !row[hLotIdx]) continue;
        const lot = String(row[hLotIdx]).trim();
        const dept = row[hDeptIdx] ? normKey(row[hDeptIdx]) : "";
        const status = row[hStatusIdx] ? String(row[hStatusIdx]).toUpperCase() : "ON HOLD";
        const reason = row[hReasonIdx] ? String(row[hReasonIdx]).trim() : "On Hold";

        if (status.includes("HOLD")) {
          // If department matches or general hold
          if (!dept || dept.includes(targetKey) || targetKey.includes(dept)) {
            holdMap.set(lot, reason);
          }
        }
      }
    }

    const rows = deptResult.values || [];
    if (rows.length === 0) {
      return res.json({
        success: true,
        department: deptConfig.tab,
        rowCount: 0,
        lots: {}
      });
    }

    const headers = rows[0] || [];
    const lotIdx = findCol(headers, ["lot number", "lot no", "lot", "lot #"]);
    const issueDateIdx = findCol(headers, ["date", "issue date", "kajbutton date", "overlock date", "feed up date", "feedupdate", "feed up issue date", "folding date", "embroidery date", "printing date", "washing date", "elastic date"]);
    const compIdx = findCol(headers, ["complete", "completed", "completion date", "kajbutton complete", "overlock complete", "feed up complete", "feed up completed", "feedup complete", "feedup completed", "feed up completion date", "folding complete", "embroidery complete", "printing complete", "washing complete", "elastic complete"]);
    const wipIdx = findCol(headers, ["wip", "wip status", "remarks", "wip kajbutton", "wip overlock", "wip feed up", "wip feedup", "feed up wip", "wip folding", "wip jaybir embroidery", "wip jaybir printing", "wip washing", "wip elastic"]);
    const supIdx = findCol(headers, ["supervisor", "kajbutton supervisor", "overlock supervisor", "feed up supervisor", "feedup supervisor", "folding supervisor", "embroidery supervisor", "printing supervisor", "washing supervisor", "elastic supervisor"]);
    const plantIdx = findCol(headers, ["washing plant", "plant", "washing unit", "wash plant", "washing vendor", "vendor", "unit", "washing party", "plant name"]);
    const pcsIdx = findCol(headers, ["total pcs", "pcs", "quantity", "qty"]);

    const lots = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const lotNumber = String(row[lotIdx !== -1 ? lotIdx : 0] || "").trim();
      if (!lotNumber) continue;

      const rawIssueDate = issueDateIdx !== -1 && row[issueDateIdx] ? String(row[issueDateIdx]).trim() : "";
      const rawComp = compIdx !== -1 && row[compIdx] ? String(row[compIdx]).trim() : "";
      const rawWip = wipIdx !== -1 && row[wipIdx] ? String(row[wipIdx]).trim() : "";
      const supervisor = supIdx !== -1 && row[supIdx] ? String(row[supIdx]).trim() : "";
      const plant = plantIdx !== -1 && row[plantIdx] ? String(row[plantIdx]).trim() : "";
      const totalPcs = pcsIdx !== -1 && row[pcsIdx] ? parseInt(row[pcsIdx], 10) || 0 : 0;

      const completionDate = parseCompDate(rawComp);
      const isCompleted = !!completionDate && completionDate !== "-" && !completionDate.toLowerCase().includes("pending");

      const { remarks, hasIssue: wipHasIssue } = parseWipInfo(rawWip, rawComp);

      const isHold = holdMap.has(lotNumber);
      const holdReason = holdMap.get(lotNumber) || "";

      const hasIssue = !isCompleted && (isHold || wipHasIssue);
      const issueRemark = isHold ? `Hold: ${holdReason}` : (remarks || "");

      let status = "Not Started";
      if (isCompleted) {
        status = "Completed";
      } else if (rawIssueDate || rawWip) {
        status = "WIP";
      }

      lots[lotNumber] = {
        lotNumber,
        department: deptConfig.tab,
        issueDate: rawIssueDate,
        completionDate: isCompleted ? completionDate : "",
        status,
        hasIssue,
        issueRemark,
        supervisor,
        plant,
        totalPcs
      };
    }

    res.json({
      success: true,
      department: deptConfig.tab,
      rowCount: Object.keys(lots).length,
      lots
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;



