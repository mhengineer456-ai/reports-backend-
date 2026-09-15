// backend/routes/timelineRoutes.js
const express = require("express");
const router = express.Router();
const config = require("../config");
const { getSheetValues } = require("../services/googleSheetsService");

/**
 * Normalize lot strings (e.g. " 76063 " -> "76063")
 */
function normalizeLot(lot) {
  if (!lot) return "";
  return String(lot).trim().toUpperCase().replace(/^LOT[-#\s]*/i, "");
}

/**
 * Dynamic column index finder based on header keywords
 */
function findCol(headers, keywords) {
  if (!Array.isArray(headers)) return -1;
  const cleanKeywords = keywords.map((k) => k.toLowerCase().trim());

  // 1. Exact match
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").toLowerCase().trim();
    if (cleanKeywords.includes(h)) return i;
  }

  // 2. Partial word match
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").toLowerCase().trim();
    if (cleanKeywords.some((k) => h.includes(k))) return i;
  }

  return -1;
}

/**
 * Parse and format dates to clean readable string (e.g. "12 Aug 2026")
 */
function formatReadableDate(dateVal) {
  if (!dateVal) return "";
  const str = String(dateVal).trim();
  if (!str || str === "-" || str.toLowerCase() === "invalid date" || str.toLowerCase() === "pending") {
    return "";
  }

  try {
    // DD/MM/YY or DD/MM/YYYY
    if (str.includes("/")) {
      const parts = str.split(" ")[0].split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 100) year = year <= 50 ? 2000 + year : 1900 + year;
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
        }
      }
    }

    // YYYY-MM-DD
    if (str.includes("-")) {
      const parts = str.split(" ")[0].split("T")[0].split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
        }
      }
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    }
  } catch (e) {}

  return str;
}

/**
 * Calculate difference in calendar days between two dates
 */
function calculateDaysDiff(d1Str, d2Str) {
  if (!d1Str || !d2Str || d1Str === "Pending" || d2Str === "Pending") return null;
  try {
    const d1 = new Date(d1Str);
    const d2 = new Date(d2Str);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? `+${diff} days` : `${diff} days`;
  } catch (e) {
    return null;
  }
}

/**
 * Helper to parse department records from a department sheet (Overlock, Folding, FeedUp, Washing, Elastic, KajButton)
 */
function parseDeptSheetMatch(rows, targetLot, deptKeywords) {
  if (!rows || rows.length < 2) return null;
  const headers = rows[0] || [];
  const lotIdx = findCol(headers, ["lot number", "lot no", "lot #", "lot"]);
  const dateIdx = findCol(headers, [...deptKeywords.map(k => `${k} date`), "date", "issue date", "saved at"]);
  const supIdx = findCol(headers, [...deptKeywords.map(k => `${k} supervisor`), "supervisor", "operator"]);
  const pcsIdx = findCol(headers, ["total pcs", "pcs", "quantity"]);
  const completeIdx = findCol(headers, [...deptKeywords.map(k => `${k} complete`), ...deptKeywords.map(k => `${k} completed`), "complete date", "completed date", "status"]);
  const wipIdx = findCol(headers, [...deptKeywords.map(k => `wip ${k}`), ...deptKeywords.map(k => `${k} wip`), "wip", "remarks", "recent remarks"]);
  const agingIdx = findCol(headers, ["aging"]);
  const stitchSupIdx = findCol(headers, ["stiching supervisor", "stitching supervisor"]);

  if (lotIdx === -1) return null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeLot(row[lotIdx]) === targetLot) {
      const completeRaw = row[completeIdx] || "";
      const wipRaw = row[wipIdx] || "";
      let isComplete = false;
      let completeDate = "";
      let wipRemarks = "";

      if (completeRaw && completeRaw !== "[]" && completeRaw !== "-") {
        if (typeof completeRaw === "string" && (completeRaw.toLowerCase().includes("complete") || completeRaw.toLowerCase().includes("done"))) {
          isComplete = true;
        }
        try {
          const parsed = JSON.parse(completeRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            isComplete = true;
            completeDate = formatReadableDate(parsed[parsed.length - 1].timestamp || parsed[parsed.length - 1].date);
          }
        } catch (e) {
          const d = formatReadableDate(completeRaw);
          if (d) {
            isComplete = true;
            completeDate = d;
          }
        }
      }

      if (wipRaw && wipRaw !== "[]") {
        try {
          const parsed = JSON.parse(wipRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            wipRemarks = parsed[parsed.length - 1].remarks || parsed[parsed.length - 1].status || "";
          }
        } catch (e) {
          wipRemarks = wipRaw;
        }
      }

      return {
        lotNo: targetLot,
        date: formatReadableDate(row[dateIdx]),
        supervisor: row[supIdx] || "",
        totalPcs: row[pcsIdx] || "",
        aging: row[agingIdx] || "0",
        isComplete,
        completeDate: completeDate || (isComplete ? "Completed" : ""),
        wipRemarks: wipRemarks || "In Progress",
        stitchingSupervisor: row[stitchSupIdx] || ""
      };
    }
  }
  return null;
}

/**
 * GET /api/timeline/lot/:lotNumber
 */
router.get("/lot/:lotNumber", async (req, res, next) => {
  try {
    const targetLot = normalizeLot(req.params.lotNumber);
    const refresh = req.query.refresh === "true" || req.query.refresh === "1";

    if (!targetLot) {
      return res.status(400).json({ success: false, error: "Missing or invalid lot number" });
    }

    const mainId = config.spreadsheetIds.main;
    const jobOrderId = config.spreadsheetIds.jobOrder;
    const issuesId = config.spreadsheetIds.issues;
    const dailyStitchingId = config.spreadsheetIds.dailyStitching;
    const workingUpdatesId = config.spreadsheetIds.workingUpdates;
    const barcodeId = config.spreadsheetIds.barcode;
    const rawpackId = config.spreadsheetIds.rawpack;

    // Fetch all departmental sheets in parallel with cache support
    const [
      indexRes,
      jobOrderRes,
      issuesRes,
      kajButtonRes,
      barcodeRes,
      feedUpRes,
      overlockRes,
      washingRes,
      foldingRes,
      elasticRes
    ] = await Promise.all([
      getSheetValues(mainId, "Index!A:AA", refresh).catch(() => ({ values: [] })),
      getSheetValues(jobOrderId, "JobOrder!A:Z", refresh).catch(() => ({ values: [] })),
      getSheetValues(issuesId, "Issues!A:R", refresh).catch(() => ({ values: [] })),
      getSheetValues(workingUpdatesId, "KajButton!B:O", refresh).catch(() => 
        getSheetValues(dailyStitchingId, "KajButton!B:O", refresh).catch(() => ({ values: [] }))
      ),
      getSheetValues(barcodeId, "LotBarcodeData!A:Z", refresh).catch(() => ({ values: [] })),
      getSheetValues(workingUpdatesId, "FeedUp!B:O", refresh).catch(() => 
        getSheetValues(dailyStitchingId, "FeedUp!B:O", refresh).catch(() => ({ values: [] }))
      ),
      getSheetValues(workingUpdatesId, "Overlock!B:O", refresh).catch(() => 
        getSheetValues(dailyStitchingId, "Overlock!B:O", refresh).catch(() => ({ values: [] }))
      ),
      getSheetValues(workingUpdatesId, "Washing!B:O", refresh).catch(() => 
        getSheetValues(dailyStitchingId, "Washing!B:O", refresh).catch(() => ({ values: [] }))
      ),
      getSheetValues(workingUpdatesId, "Folding!B:O", refresh).catch(() => 
        getSheetValues(dailyStitchingId, "Folding!B:O", refresh).catch(() => ({ values: [] }))
      ),
      getSheetValues(workingUpdatesId, "Elastic!B:O", refresh).catch(() => 
        getSheetValues(dailyStitchingId, "Elastic!B:O", refresh).catch(() => ({ values: [] }))
      )
    ]);

    // 1. DYNAMICALLY MAP JOBORDER HEADERS
    const jobRows = jobOrderRes.values || [];
    const jobHeaders = jobRows[0] || [];
    const jLotIdx = findCol(jobHeaders, ["lot number", "lot no", "lot #", "lot"]);
    const jNoIdx = findCol(jobHeaders, ["job order no", "job order", "job no"]);
    const jDateIdx = findCol(jobHeaders, ["date", "job date", "order date"]);
    const jPartyIdx = findCol(jobHeaders, ["party name", "party", "client"]);
    const jGarmentIdx = findCol(jobHeaders, ["garment type", "garment"]);
    const jFabricIdx = findCol(jobHeaders, ["fabric", "fabric type"]);
    const jStyleIdx = findCol(jobHeaders, ["style", "style no"]);
    const jQtyIdx = findCol(jobHeaders, ["quantity", "total pcs", "qty", "pcs"]);
    const jEmbIdx = findCol(jobHeaders, ["emb", "embroidery"]);
    const jPrintIdx = findCol(jobHeaders, ["printing", "print"]);

    let jobMatch = null;
    if (jLotIdx !== -1) {
      for (let i = 1; i < jobRows.length; i++) {
        const row = jobRows[i];
        if (normalizeLot(row[jLotIdx]) === targetLot) {
          jobMatch = {
            jobOrderNo: row[jNoIdx] || "",
            lotNo: targetLot,
            jobDate: formatReadableDate(row[jDateIdx]),
            party: row[jPartyIdx] || "",
            garment: row[jGarmentIdx] || "",
            fabric: row[jFabricIdx] || "",
            style: row[jStyleIdx] || "",
            totalPcs: row[jQtyIdx] || "",
            embRequired: String(row[jEmbIdx] || "").toLowerCase().includes("yes"),
            printRequired: String(row[jPrintIdx] || "").toLowerCase().includes("yes")
          };
          break;
        }
      }
    }

    // 2. DYNAMICALLY MAP INDEX HEADERS
    const indexRows = indexRes.values || [];
    const indexHeaders = indexRows[0] || [];
    const iLotIdx = findCol(indexHeaders, ["lot number", "lot no", "lot #", "lot"]);
    const iCutDateIdx = findCol(indexHeaders, ["saved at", "cut date", "cutting date", "date"]);
    const iCutQtyIdx = findCol(indexHeaders, ["cutting qty", "cutting pcs", "cut qty", "pcs", "quantity"]);
    const iPartyIdx = findCol(indexHeaders, ["party name", "party", "client"]);
    const iGarmentIdx = findCol(indexHeaders, ["garment type", "garment"]);
    const iFabricIdx = findCol(indexHeaders, ["fabric"]);
    const iStyleIdx = findCol(indexHeaders, ["style"]);
    const iChallanIdx = findCol(indexHeaders, ["challan history", "challan"]);
    const iIssueDateIdx = findCol(indexHeaders, ["date of issue", "issue date", "stitching issue"]);
    const iSupIdx = findCol(indexHeaders, ["supervisor", "stitching supervisor", "stiching supervisor"]);
    const iWipIdx = findCol(indexHeaders, ["wip status", "wip"]);
    const iCompIdx = findCol(indexHeaders, ["completed status", "complete status", "completed date", "status"]);
    const iImageIdx = findCol(indexHeaders, ["image", "image url", "photo"]);

    let indexMatch = null;
    if (iLotIdx !== -1) {
      for (let i = 1; i < indexRows.length; i++) {
        const row = indexRows[i];
        if (normalizeLot(row[iLotIdx]) === targetLot) {
          indexMatch = {
            lotNo: targetLot,
            cutDate: formatReadableDate(row[iCutDateIdx]),
            cuttingQty: row[iCutQtyIdx] || "",
            party: row[iPartyIdx] || "",
            garment: row[iGarmentIdx] || "",
            fabric: row[iFabricIdx] || "",
            style: row[iStyleIdx] || "",
            challanHistoryRaw: row[iChallanIdx] || "",
            dateOfIssue: formatReadableDate(row[iIssueDateIdx]),
            stitchingSupervisor: row[iSupIdx] || "",
            wipStatus: row[iWipIdx] || "",
            completedStatus: formatReadableDate(row[iCompIdx]),
            image: row[iImageIdx] || ""
          };
          break;
        }
      }
    }

    // 3. DYNAMICALLY MAP ISSUES (PACKING) HEADERS
    const issuesRows = issuesRes.values || [];
    const issuesHeaders = issuesRows[0] || [];
    const pLotIdx = findCol(issuesHeaders, ["lot number", "lot no", "lot"]);
    const pDateIdx = findCol(issuesHeaders, ["packing date", "date", "pkg date", "date of issue"]);
    const pSupIdx = findCol(issuesHeaders, ["packing supervisor", "supervisor"]);
    const pWipIdx = findCol(issuesHeaders, ["wip packing", "remarks", "status"]);
    const pCompIdx = findCol(issuesHeaders, ["packing complete", "packing completed", "complete date", "completed date"]);

    let issuesMatch = null;
    if (pLotIdx !== -1) {
      for (let i = 1; i < issuesRows.length; i++) {
        const row = issuesRows[i];
        if (normalizeLot(row[pLotIdx]) === targetLot) {
          issuesMatch = {
            lotNo: targetLot,
            pkgDate: formatReadableDate(row[pDateIdx]),
            pkgSupervisor: row[pSupIdx] || "",
            wipPacking: row[pWipIdx] || "",
            packingComplete: formatReadableDate(row[pCompIdx])
          };
          break;
        }
      }
    }

    // 4. PARSE SPECIFIC DEPARTMENT MATCHES
    const kajMatch = parseDeptSheetMatch(kajButtonRes.values, targetLot, ["kaj", "kajbutton"]);
    const feedUpMatch = parseDeptSheetMatch(feedUpRes.values, targetLot, ["feed up", "feedup"]);
    const overlockMatch = parseDeptSheetMatch(overlockRes.values, targetLot, ["overlock"]);
    const washingMatch = parseDeptSheetMatch(washingRes.values, targetLot, ["washing"]);
    const foldingMatch = parseDeptSheetMatch(foldingRes.values, targetLot, ["folding"]);
    const elasticMatch = parseDeptSheetMatch(elasticRes.values, targetLot, ["elastic"]);

    // 5. MAP BARCODE SCANS
    const barcodeRows = barcodeRes.values || [];
    let barcodeMatch = null;
    if (barcodeRows.length > 0) {
      const bHeaders = barcodeRows[0] || [];
      const bLotIdx = findCol(bHeaders, ["lot number", "lot no", "lot"]);
      const bDateIdx = findCol(bHeaders, ["date", "timestamp", "scan date"]);
      const bCartonIdx = findCol(bHeaders, ["carton", "cartons", "count"]);
      if (bLotIdx !== -1) {
        for (let i = 1; i < barcodeRows.length; i++) {
          const row = barcodeRows[i];
          if (normalizeLot(row[bLotIdx]) === targetLot) {
            barcodeMatch = {
              lotNo: targetLot,
              barcodeDate: formatReadableDate(row[bDateIdx]),
              cartonCount: row[bCartonIdx] || ""
            };
            break;
          }
        }
      }
    }

    if (!jobMatch && !indexMatch && !issuesMatch && !kajMatch && !feedUpMatch && !overlockMatch && !washingMatch && !foldingMatch && !elasticMatch && !barcodeMatch) {
      return res.status(404).json({
        success: false,
        message: `No manufacturing records found for Lot #${targetLot}`
      });
    }

    // Resolve Best Values Across Sheets
    const bestParty = jobMatch?.party || indexMatch?.party || "MH";
    const bestFabric = indexMatch?.fabric || jobMatch?.fabric || "N/A";
    const bestStyle = indexMatch?.style || jobMatch?.style || "Standard";
    const bestGarment = indexMatch?.garment || jobMatch?.garment || "Garment";
    const bestTotalPcs = indexMatch?.cuttingQty || jobMatch?.totalPcs || kajMatch?.totalPcs || overlockMatch?.totalPcs || foldingMatch?.totalPcs || "N/A";

    // Extract Challan Details
    let embChallan = null;
    let printChallan = null;
    const rawChallan = indexMatch?.challanHistoryRaw || "";
    if (rawChallan) {
      try {
        if (rawChallan.trim().startsWith("[")) {
          const parsed = JSON.parse(rawChallan);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsed.forEach(c => {
              const num = String(c.number || c.challanNo || "").toLowerCase();
              if (num.includes("emb")) embChallan = c;
              if (num.includes("print")) printChallan = c;
            });
            if (!embChallan && !printChallan) {
              embChallan = parsed[0];
            }
          }
        }
      } catch (e) {}
    }

    const hasStitchIssue = !!indexMatch?.dateOfIssue;
    const hasStitchComplete =
      !!indexMatch?.completedStatus &&
      indexMatch.completedStatus !== "-" &&
      !indexMatch.completedStatus.toLowerCase().includes("pending");

    // BUILD ALL FACTORY DEPARTMENTS IN CHRONOLOGICAL ORDER
    const milestones = [];
    let stageCounter = 1;

    // 1. JOB ORDER CREATED
    const hasJob = !!jobMatch || !!indexMatch;
    const jobOrderIssueDate = jobMatch?.jobDate || indexMatch?.cutDate || "N/A";
    const jobOrderCompDate = jobMatch?.jobDate || indexMatch?.cutDate || "Confirmed";
    milestones.push({
      id: "job_order",
      stageNumber: stageCounter++,
      title: "Job Order Created",
      department: "Planning & Job Order",
      subtitle: `Fabric: ${bestFabric} • Style: ${bestStyle}`,
      icon: "📋",
      status: hasJob ? "completed" : "pending",
      issueDate: jobOrderIssueDate,
      completeDate: jobOrderCompDate,
      dwellDays: null,
      details: {
        jobOrderNo: jobMatch?.jobOrderNo || "Assigned",
        party: bestParty,
        style: bestStyle,
        fabric: bestFabric,
        totalPcs: bestTotalPcs,
        embRequired: jobMatch?.embRequired || false,
        printRequired: jobMatch?.printRequired || false
      }
    });

    // 2. FABRIC CUTTING
    const hasCut = !!indexMatch?.cutDate;
    const cutIssueDate = jobMatch?.jobDate || indexMatch?.cutDate || "N/A";
    const cutCompleteDate = indexMatch?.cutDate || "Pending";
    milestones.push({
      id: "cutting",
      stageNumber: stageCounter++,
      title: "Fabric Cutting",
      department: "Cutting Department",
      subtitle: hasCut ? `Cut Quantity: ${bestTotalPcs} Pcs` : "Layers cut & bundled",
      icon: "✂️",
      status: hasCut ? "completed" : "pending",
      issueDate: cutIssueDate,
      completeDate: cutCompleteDate,
      dwellDays: calculateDaysDiff(cutIssueDate, cutCompleteDate),
      details: {
        cuttingQty: bestTotalPcs,
        partyInitials: bestParty
      }
    });

    // 3. JAYBIR PRINTING
    const printRequired = jobMatch?.printRequired || !!printChallan || rawChallan.toLowerCase().includes("print");
    if (printRequired) {
      const isPrintDone = printChallan?.completed || (printChallan?.date && hasStitchIssue);
      const printDate = formatReadableDate(printChallan?.date || printChallan?.dateOfIssue) || indexMatch?.cutDate || "Pending";
      const printCompDate = isPrintDone ? formatReadableDate(printChallan?.completedAt || printDate) : "In Progress";
      milestones.push({
        id: "printing",
        stageNumber: stageCounter++,
        title: "Jaybir Printing",
        department: "Printing Department",
        subtitle: isPrintDone ? "Screen printing & curing completed" : "Active in screen printing unit",
        icon: "🖼️",
        status: isPrintDone ? "completed" : hasCut ? "in_progress" : "pending",
        issueDate: printDate,
        completeDate: printCompDate,
        dwellDays: calculateDaysDiff(printDate, printCompDate),
        details: {
          challan: printChallan?.number || "Challan Issued",
          supervisor: "Jaybir Print Sup"
        }
      });
    }

    // 4. JAYBIR EMBROIDERY
    const embRequired = jobMatch?.embRequired || !!embChallan || rawChallan.toLowerCase().includes("emb");
    if (embRequired) {
      const isEmbDone = embChallan?.completed || (embChallan?.date && hasStitchIssue);
      const embDate = formatReadableDate(embChallan?.date || embChallan?.dateOfIssue) || indexMatch?.cutDate || "Pending";
      const embCompDate = isEmbDone ? formatReadableDate(embChallan?.completedAt || embDate) : "In Progress";
      milestones.push({
        id: "embroidery",
        stageNumber: stageCounter++,
        title: "Jaybir Embroidery",
        department: "Embroidery Department",
        subtitle: isEmbDone ? "Multi-head embroidery stitching completed" : "Active in embroidery unit",
        icon: "🧵",
        status: isEmbDone ? "completed" : hasCut ? "in_progress" : "pending",
        issueDate: embDate,
        completeDate: embCompDate,
        dwellDays: calculateDaysDiff(embDate, embCompDate),
        details: {
          challan: embChallan?.number || "Challan Issued",
          supervisor: "Jaybir Emb Sup"
        }
      });
    }

    // 5. ELASTIC ATTACHMENT
    if (elasticMatch || (indexMatch?.wipStatus && indexMatch.wipStatus.toLowerCase().includes("elastic"))) {
      const isElasticDone = elasticMatch?.isComplete || hasStitchComplete;
      const elasticDate = elasticMatch?.date || indexMatch?.cutDate || "Pending";
      const elasticCompDate = elasticMatch?.completeDate || (isElasticDone ? "Completed" : "In Progress");
      milestones.push({
        id: "elastic",
        stageNumber: stageCounter++,
        title: "Elastic Attachment",
        department: "Elastic Department",
        subtitle: elasticMatch?.supervisor ? `Supervisor: ${elasticMatch.supervisor}` : "Waistband/Cuff elastic attachment",
        icon: "🪢",
        status: isElasticDone ? "completed" : hasCut ? "in_progress" : "pending",
        issueDate: elasticDate,
        completeDate: elasticCompDate,
        dwellDays: calculateDaysDiff(elasticDate, elasticCompDate),
        details: {
          supervisor: elasticMatch?.supervisor || "Elastic Sup",
          wipRemarks: elasticMatch?.wipRemarks || ""
        }
      });
    }

    // 6. FLOOR STITCHING ASSEMBLY
    const stitchIssueDate = indexMatch?.dateOfIssue || "Pending";
    const stitchCompleteDate = indexMatch?.completedStatus || (hasStitchComplete ? "Completed" : "In Progress");
    milestones.push({
      id: "stitching",
      stageNumber: stageCounter++,
      title: "Floor Stitching Assembly",
      department: "Stitching Department",
      subtitle: indexMatch?.stitchingSupervisor
        ? `Supervisor: ${indexMatch.stitchingSupervisor}`
        : "Floor assembly line queue",
      icon: "🪡",
      status: hasStitchComplete ? "completed" : hasStitchIssue ? "in_progress" : "pending",
      issueDate: stitchIssueDate,
      completeDate: stitchCompleteDate,
      dwellDays: calculateDaysDiff(stitchIssueDate, stitchCompleteDate),
      details: {
        supervisor: indexMatch?.stitchingSupervisor || "Not Assigned",
        wipStatus: indexMatch?.wipStatus || "In Progress"
      }
    });

    // 7. FEED UP DEPARTMENT
    if (feedUpMatch || (indexMatch?.wipStatus && indexMatch.wipStatus.toLowerCase().includes("feed"))) {
      const isFeedDone = feedUpMatch?.isComplete || hasStitchComplete;
      const feedDate = feedUpMatch?.date || indexMatch?.dateOfIssue || "Pending";
      const feedCompDate = feedUpMatch?.completeDate || (isFeedDone ? "Completed" : "In Progress");
      milestones.push({
        id: "feedup",
        stageNumber: stageCounter++,
        title: "Feed Up Department",
        department: "Feed Up Department",
        subtitle: feedUpMatch?.supervisor ? `Supervisor: ${feedUpMatch.supervisor}` : "Feed-up operations & seam joining",
        icon: "⚡",
        status: isFeedDone ? "completed" : hasStitchIssue ? "in_progress" : "pending",
        issueDate: feedDate,
        completeDate: feedCompDate,
        dwellDays: calculateDaysDiff(feedDate, feedCompDate),
        details: {
          supervisor: feedUpMatch?.supervisor || "Feed Up Sup",
          wipRemarks: feedUpMatch?.wipRemarks || ""
        }
      });
    }

    // 8. DAILY OVERLOCK
    if (overlockMatch || (indexMatch?.wipStatus && indexMatch.wipStatus.toLowerCase().includes("overlock"))) {
      const isOverlockDone = overlockMatch?.isComplete || hasStitchComplete;
      const overlockDate = overlockMatch?.date || indexMatch?.dateOfIssue || "Pending";
      const overlockCompDate = overlockMatch?.completeDate || (isOverlockDone ? "Completed" : "In Progress");
      milestones.push({
        id: "overlock",
        stageNumber: stageCounter++,
        title: "Daily Overlock",
        department: "Overlock Department",
        subtitle: overlockMatch?.supervisor ? `Supervisor: ${overlockMatch.supervisor}` : "Overlock stitching & edge trimming",
        icon: "➰",
        status: isOverlockDone ? "completed" : hasStitchIssue ? "in_progress" : "pending",
        issueDate: overlockDate,
        completeDate: overlockCompDate,
        dwellDays: calculateDaysDiff(overlockDate, overlockCompDate),
        details: {
          supervisor: overlockMatch?.supervisor || "Overlock Sup",
          aging: overlockMatch?.aging || "0",
          wipRemarks: overlockMatch?.wipRemarks || ""
        }
      });
    }

    // 9. KAJ BUTTON & SECONDARY WORK
    const isKajDone =
      kajMatch?.isComplete ||
      kajMatch?.status?.toLowerCase().includes("complete") ||
      kajMatch?.status?.toLowerCase().includes("done") ||
      !!issuesMatch?.pkgDate;
    const kajIssueDate = kajMatch?.date || indexMatch?.completedStatus || (hasStitchComplete ? "Issued" : "Pending");
    const kajCompDate = isKajDone ? (kajMatch?.completeDate || issuesMatch?.pkgDate || "Completed") : "In Progress";
    milestones.push({
      id: "kaj_button",
      stageNumber: stageCounter++,
      title: "Kaj Button & Secondary Work",
      department: "Kaj Button Department",
      subtitle: kajMatch?.supervisor ? `Supervisor: ${kajMatch.supervisor}` : "Button attachment & keyhole inspection",
      icon: "🔘",
      status: isKajDone ? "completed" : hasStitchComplete ? "in_progress" : "pending",
      issueDate: kajIssueDate,
      completeDate: kajCompDate,
      dwellDays: calculateDaysDiff(kajIssueDate, kajCompDate),
      details: {
        supervisor: kajMatch?.supervisor || "Kaj Sup",
        totalPcs: kajMatch?.totalPcs || bestTotalPcs,
        agingDays: kajMatch?.aging || "0",
        remarks: kajMatch?.remarks || kajMatch?.wipRemarks || "None"
      }
    });

    // 10. WASHING DEPARTMENT
    if (washingMatch || (indexMatch?.wipStatus && indexMatch.wipStatus.toLowerCase().includes("wash"))) {
      const isWashDone = washingMatch?.isComplete || !!issuesMatch?.pkgDate;
      const washDate = washingMatch?.date || kajCompDate || "Pending";
      const washCompDate = washingMatch?.completeDate || (isWashDone ? "Completed" : "In Progress");
      milestones.push({
        id: "washing",
        stageNumber: stageCounter++,
        title: "Washing Department",
        department: "Washing Department",
        subtitle: washingMatch?.supervisor ? `Supervisor: ${washingMatch.supervisor}` : "Garment wash, softness & drying",
        icon: "🌊",
        status: isWashDone ? "completed" : isKajDone ? "in_progress" : "pending",
        issueDate: washDate,
        completeDate: washCompDate,
        dwellDays: calculateDaysDiff(washDate, washCompDate),
        details: {
          supervisor: washingMatch?.supervisor || "Washing Sup",
          wipRemarks: washingMatch?.wipRemarks || ""
        }
      });
    }

    // 11. DAILY FOLDING
    if (foldingMatch || (indexMatch?.wipStatus && indexMatch.wipStatus.toLowerCase().includes("fold"))) {
      const isFoldDone = foldingMatch?.isComplete || !!issuesMatch?.pkgDate;
      const foldDate = foldingMatch?.date || kajCompDate || "Pending";
      const foldCompDate = foldingMatch?.completeDate || (isFoldDone ? "Completed" : "In Progress");
      milestones.push({
        id: "folding",
        stageNumber: stageCounter++,
        title: "Daily Folding",
        department: "Folding Department",
        subtitle: foldingMatch?.supervisor ? `Supervisor: ${foldingMatch.supervisor}` : "Folding, steam press & polybagging",
        icon: "📦",
        status: isFoldDone ? "completed" : isKajDone ? "in_progress" : "pending",
        issueDate: foldDate,
        completeDate: foldCompDate,
        dwellDays: calculateDaysDiff(foldDate, foldCompDate),
        details: {
          supervisor: foldingMatch?.supervisor || "Folding Sup",
          aging: foldingMatch?.aging || "0",
          wipRemarks: foldingMatch?.wipRemarks || ""
        }
      });
    }

    // 12. PACKING & FINISHING
    const hasPkgIssue = !!issuesMatch?.pkgDate;
    const hasPkgComplete =
      !!issuesMatch?.packingComplete &&
      issuesMatch.packingComplete !== "-" &&
      !issuesMatch.packingComplete.toLowerCase().includes("pending");
    const hasBarcode = !!barcodeMatch;
    const isFullyComplete = hasPkgComplete || hasBarcode;

    const pkgIssueDate = issuesMatch?.pkgDate || (isKajDone ? "Issued" : "Pending");
    const pkgCompDate = issuesMatch?.packingComplete || barcodeMatch?.barcodeDate || (isFullyComplete ? "Completed" : "In Progress");

    milestones.push({
      id: "packing",
      stageNumber: stageCounter++,
      title: "Packing & Finishing",
      department: "Packing Department",
      subtitle: issuesMatch?.pkgSupervisor ? `Supervisor: ${issuesMatch.pkgSupervisor}` : "Carton boxing & sticker allocation",
      icon: "🏷️",
      status: isFullyComplete ? "completed" : hasPkgIssue ? "in_progress" : "pending",
      issueDate: pkgIssueDate,
      completeDate: pkgCompDate,
      dwellDays: calculateDaysDiff(pkgIssueDate, pkgCompDate),
      details: {
        supervisor: issuesMatch?.pkgSupervisor || "Packing Sup",
        wipRemarks: issuesMatch?.wipPacking || "",
        barcodeScanned: hasBarcode,
        barcodeDate: barcodeMatch?.barcodeDate || "N/A"
      }
    });

    // Calculate Progress %
    const completedCount = milestones.filter((m) => m.status === "completed").length;
    const progressPercent = Math.round((completedCount / milestones.length) * 100);

    let currentStage = "Order Received";
    const inProgressMilestone = milestones.find((m) => m.status === "in_progress");
    if (inProgressMilestone) {
      currentStage = inProgressMilestone.title;
    } else if (isFullyComplete) {
      currentStage = "Ready for Dispatch / Completed";
    } else {
      const lastCompleted = [...milestones].reverse().find((m) => m.status === "completed");
      currentStage = lastCompleted ? `Completed ${lastCompleted.title}` : "Pending Initial Operations";
    }

    res.json({
      success: true,
      lotNumber: targetLot,
      summary: {
        party: bestParty,
        style: bestStyle,
        fabric: bestFabric,
        garment: bestGarment,
        totalPcs: bestTotalPcs,
        currentStage,
        progressPercent,
        isFullyComplete,
        totalLeadTimeDays: isFullyComplete ? "Verified Complete" : "In Progress",
        image: indexMatch?.image || "",
        totalDepartments: milestones.length,
        completedDepartments: completedCount
      },
      milestones
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
