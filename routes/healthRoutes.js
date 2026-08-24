// backend/routes/healthRoutes.js
const express = require("express");
const router = express.Router();
const config = require("../config");

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Factory Suite Pro Backend API",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

module.exports = router;
