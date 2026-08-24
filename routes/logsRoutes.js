// backend/routes/logsRoutes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const config = require("../config");
const { getSheetValues, clearCache } = require("../services/googleSheetsService");

/**
 * GET /api/logs
 * Fetch all Lot Logs
 */
router.get("/", async (req, res, next) => {
  try {
    const lotLogsSpreadsheetId = config.spreadsheetIds.lotLogs;
    const result = await getSheetValues(lotLogsSpreadsheetId, "LotLogs!A1:I1000", req.query.refresh === "true");
    const rows = result.values || [];

    if (rows.length <= 1) {
      return res.json({ success: true, logs: [], source: result.source });
    }

    const logs = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || !row[0]) continue;

      const rawTimestamp = row[0] || "";
      const logId = row[1] || `LOG-${i}`;
      const lotNum = row[2] || "";
      const details = row[3] || "";
      const cBy = row[4] || "User";
      const pBy = row[5] || "Authorized Head";
      const cat = row[6] || "Job Order";
      const prio = row[7] || "Standard Update";
      const seenByRaw = row[8] || "";
      const seenByList = seenByRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      logs.push({
        id: logId,
        lotNumber: lotNum,
        changeDetails: details,
        changedBy: cBy,
        permissionBy: pBy,
        category: cat,
        priority: prio,
        timestamp: rawTimestamp,
        seenBy: seenByList
      });
    }

    // Newest logs first
    logs.reverse();

    res.json({
      success: true,
      source: result.source,
      count: logs.length,
      logs
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/logs
 * Add new lot log
 */
router.post("/", async (req, res, next) => {
  try {
    const { lotNumber, changeDetails, changedBy, permissionBy, category, priority } = req.body || {};

    const newLog = {
      action: "add_log",
      id: `LOG-${Date.now().toString().slice(-5)}`,
      lotNumber: String(lotNumber || "").trim(),
      changeDetails: String(changeDetails || "").trim(),
      changedBy: String(changedBy || "System User").trim(),
      permissionBy: String(permissionBy || "Authorized Head").trim(),
      category: String(category || "Job Order").trim(),
      priority: String(priority || "Standard Update").trim(),
      timestamp: new Date().toISOString()
    };

    if (config.lotLogsWebhookUrl) {
      await axios.post(config.lotLogsWebhookUrl, newLog, {
        headers: { "Content-Type": "text/plain;charset=utf-8" }
      });
    }

    // Flush cache so next GET /api/logs gets new row
    clearCache(config.spreadsheetIds.lotLogs, "LotLogs!A1:I1000");

    res.status(201).json({
      success: true,
      message: "Lot Log created and synchronized successfully",
      log: newLog
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/logs/mark-read
 * Mark a log as read by a user
 */
router.post("/mark-read", async (req, res, next) => {
  try {
    const { logId, userName } = req.body || {};

    if (!logId || !userName) {
      return res.status(400).json({ error: "logId and userName are required." });
    }

    const payload = {
      action: "mark_read",
      logId,
      userName
    };

    if (config.lotLogsWebhookUrl) {
      await axios.post(config.lotLogsWebhookUrl, payload, {
        headers: { "Content-Type": "text/plain;charset=utf-8" }
      });
    }

    clearCache(config.spreadsheetIds.lotLogs, "LotLogs!A1:I1000");

    res.json({
      success: true,
      message: `Log ${logId} marked as read for ${userName}`
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
