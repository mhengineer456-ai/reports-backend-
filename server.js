// backend/server.js
const express = require("express");
const cors = require("cors");
const config = require("./config");

// Import route modules
const healthRoutes = require("./routes/healthRoutes");
const sheetsRoutes = require("./routes/sheetsRoutes");
const authRoutes = require("./routes/authRoutes");
const logsRoutes = require("./routes/logsRoutes");

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger (Development)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// API Routes
app.use("/api/health", healthRoutes);
app.use("/api/sheets", sheetsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/logs", logsRoutes);

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Factory Suite Pro Backend API Server",
    docs: "/api/health"
  });
});

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.originalUrl
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal Server Error"
  });
});

// Start Server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Factory Suite Pro Backend Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
});

module.exports = app;
