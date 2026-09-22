// backend/routes/aiRoutes.js
const express = require("express");
const router = express.Router();
const aiService = require("../services/aiService");

/**
 * POST /api/ai/query
 * Receives user prompt + current report context and returns intelligent AI analysis.
 */
router.post("/query", async (req, res, next) => {
  try {
    const { prompt, context, apiKey } = req.body;
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required in request body"
      });
    }

    const result = await aiService.queryReportAI(prompt, context || {}, apiKey || "");
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
