// backend/config/index.js
const dotenv = require("dotenv");
const path = require("path");

// Load .env from backend directory, fallback to parent directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  googleApiKey: process.env.REACT_APP_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY || "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk",
  spreadsheetIds: {
    main: process.env.REACT_APP_MAIN_SPREADSHEET_ID || "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA",
    jobOrder: process.env.REACT_APP_JOBORDER_SPREADSHEET_ID || "1fKSwGBIpzWEFk566WRQ4bzQ0anJlmasoY8TwrTLQHXI",
    issues: process.env.REACT_APP_ISSUES_SPREADSHEET_ID || "1uo14nKO_yHu4AJ2rOgaJajuprcinj6xw1AUMFJ6_zYM",
    dailyStitching: process.env.REACT_APP_DAILY_STITCHING_SPREADSHEET_ID || "1IMhmYlJ3s2PPRgEQs1Ikd4O1OBXK4EYL1oV_-kWAkyg",
    workingUpdates: process.env.REACT_APP_WORKING_UPDATES_SPREADSHEET_ID || "1Nh7XYE_MnAxtaTRUUntHvBpzctODwjnkbBYDiYLQgoc",
    zip: process.env.REACT_APP_ZIP_SPREADSHEET_ID || "16mifNw0WMIlnZ1XRHsuH_8kVUm_6Y1O3uVsoM-Hjppo",
    dori: process.env.REACT_APP_DORI_SPREADSHEET_ID || "1LjwZqU26F0xwL1tEyps8txsM1qS8LLUuE-sy_4CQK6k",
    rawpack: process.env.REACT_APP_RAWPACK_SPREADSHEET_ID || "1xD8Uy1lUgvNTQ2RGRBI4ZjOrozbinUPRq2_UfIplP98",
    lotLogs: process.env.REACT_APP_LOT_LOGS_SPREADSHEET_ID || "1dnukAAjyZy-W6oiRvT-6rcyTE5Rlu3u4GJqVXyN382I",
    credentials: process.env.REACT_APP_CREDENTIALS_SPREADSHEET_ID || "1iBDfsxA9XEC9nhQE-ALBYlyGRZWOaCYvWsnGfYYbr1I",
    knitting: process.env.REACT_APP_KNITTING_SPREADSHEET_ID || "1yHVieyNb7A5rds3oBEaUlfxxgG04QetLpb8T9g_xQPw",
    embPrintRemarks: process.env.REACT_APP_EMB_PRINT_REMARKS_SPREADSHEET_ID || "1ZAAVyKqAqQkBvwFv19pu1WT3g227XJ8ZpM_JSb_nMd8",
    barcode: process.env.REACT_APP_BARCODE_SPREADSHEET_ID || "1dOCjNFwaAel5qun0_ZJVIGmREqjI76CJBBFIjM3NHv8",
    shadePo: process.env.REACT_APP_SHADE_PO_SPREADSHEET_ID || "1JgJF9Er7lYDW0rINQzUUafqonx0yxkVaAauPgX5QNfk",
    holdLots: process.env.REACT_APP_HOLD_LOTS_SPREADSHEET_ID || "1oBetbe44z2lUXngctvk3J31WBiWTv07NIgx5jFlylOs"
  },
  lotLogsWebhookUrl: process.env.REACT_APP_LOT_LOGS_WEBHOOK_URL || "https://script.google.com/macros/s/AKfycby7j4mUEdmUM7TdFMPsonig_elsdYsRHb389ZPGka7yRYxDlOnZRFto_oI-Uqp0vVIJ/exec",
  embPrintRemarksWebhookUrl: process.env.REACT_APP_EMB_PRINT_REMARKS_WEBHOOK_URL || "https://script.google.com/macros/s/AKfycbyMDwX4P8mUmpkodGdoHQQvFMqW4z0LWvqeWFByh4pAF3GFDXrlLpGV9M7dHqHLB-bZ/exec",
  holdLotsWebhookUrl: process.env.REACT_APP_HOLD_LOTS_WEBHOOK_URL || "https://script.google.com/macros/s/AKfycbwhfQMI2uYzDc-VBoYbk6McZCArUShh-3xNE_qwV4MFEb4C53dRTxPpifjRp2sHoVd_Yg/exec",
  cacheTTL: parseInt(process.env.CACHE_TTL || "60", 10) // Cache TTL in seconds (default 60s)
};
