// backend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const config = require("../config");
const { getSheetValues } = require("../services/googleSheetsService");

const DEFAULT_USERS = [
  { id: "admin", name: "Administrator", password: "1234", role: "Admin", avatarColor: "#4f46e5" },
  { id: "manager", name: "Production Manager", password: "pass", role: "Manager", avatarColor: "#059669" },
  { id: "supervisor", name: "Stitching Supervisor", password: "123", role: "Supervisor", avatarColor: "#d97706" },
  { id: "viewer", name: "Guest Viewer", password: "view", role: "Viewer", avatarColor: "#2563eb" }
];

/**
 * POST /api/auth/login
 * Body: { userId, password }
 */
router.post("/login", async (req, res) => {
  const { userId, password } = req.body || {};

  if (!userId || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const trimmedId = String(userId).trim().toLowerCase();
  const trimmedPass = String(password).trim();

  // 1. Try credentials spreadsheet
  try {
    const credsSheetId = config.spreadsheetIds.credentials;
    const result = await getSheetValues(credsSheetId, "ReportsLoginCredentials!A1:C200", false);
    const rows = result.values || [];

    if (rows.length > 0) {
      const headerRow = rows[0].map((h) => String(h || "").trim().toLowerCase());
      let userIdx = headerRow.findIndex((h) => h.includes("user") || h.includes("id") || h.includes("name"));
      let passIdx = headerRow.findIndex((h) => h.includes("pass"));
      let roleIdx = headerRow.findIndex((h) => h.includes("role"));

      if (userIdx === -1) userIdx = 0;
      if (passIdx === -1) passIdx = 1;
      if (roleIdx === -1) roleIdx = 2;

      const dataRows = rows.slice(1);
      const matchedRow = dataRows.find((r) => {
        const uName = String(r[userIdx] || "").trim().toLowerCase();
        const uPass = String(r[passIdx] || "").trim();
        return uName === trimmedId && uPass === trimmedPass;
      });

      if (matchedRow) {
        const uNameRaw = String(matchedRow[userIdx] || "").trim();
        const uRoleRaw = String(matchedRow[roleIdx] || "User").trim();

        return res.json({
          success: true,
          user: {
            id: uNameRaw,
            name: uNameRaw,
            role: uRoleRaw,
            avatarColor: uRoleRaw.toLowerCase().includes("admin") ? "#4f46e5" : "#059669",
            loggedInAt: new Date().toISOString()
          }
        });
      }
    }
  } catch (err) {
    console.warn("Backend Sheet credentials fetch error, trying default fallback:", err.message);
  }

  // 2. Fallback to default user array
  const matchedUser = DEFAULT_USERS.find(
    (u) => u.id.toLowerCase() === trimmedId && u.password === trimmedPass
  );

  if (matchedUser) {
    return res.json({
      success: true,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        role: matchedUser.role,
        avatarColor: matchedUser.avatarColor,
        loggedInAt: new Date().toISOString()
      }
    });
  }

  return res.status(401).json({ success: false, error: "Invalid credentials. Please check your username and password." });
});

module.exports = router;
