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
  } catch (e) {
    // Fallback to raw string
  }

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
    const workingUpdatesId = config.spreadsheetIds.workingUpdates;
    const barcodeId = config.spreadsheetIds.barcode;
    const rawpackId = config.spreadsheetIds.rawpack;

    // Fetch all relevant sheets in parallel with cache support
    const [
      indexRes,
      jobOrderRes,
      issuesRes,
      kajButtonRes,
      barcodeRes,
      rawpackRes
    ] = await Promise.all([
      getSheetValues(mainId, "Index!A:AA", refresh).catch(() => ({ values: [] })),
      getSheetValues(jobOrderId, "JobOrder!A:Z", refresh).catch(() => ({ values: [] })),
      getSheetValues(issuesId, "Issues!A:R", refresh).catch(() => ({ values: [] })),
      getSheetValues(workingUpdatesId, "KajButton!B:O", refresh).catch(() => ({ values: [] })),
      getSheetValues(barcodeId, "LotBarcodeData!A:Z", refresh).catch(() => ({ values: [] })),
      getSheetValues(rawpackId, "RAWPACK!A:ZZ", refresh).catch(() => ({ values: [] }))
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

    // 4. DYNAMICALLY MAP KAJBUTTON HEADERS
    const kajRows = kajRes.values || [];
    const kajHeaders = kajRows[0] || [];
    const kLotIdx = findCol(kajHeaders, ["lot number", "lot no", "lot"]);
    const kDateIdx = findCol(kajHeaders, ["kajbutton date", "date", "issue date"]);
    const kSupIdx = findCol(kajHeaders, ["kajbutton supervisor", "supervisor"]);
    const kPcsIdx = findCol(kajHeaders, ["total pcs", "pcs", "quantity"]);
    const kAgingIdx = findCol(kajHeaders, ["aging"]);
    const kStatusIdx = findCol(kajHeaders, ["status"]);
    const kRemarksIdx = findCol(kajHeaders, ["remarks", "recent remarks"]);
    const kStitchSupIdx = findCol(kajHeaders, ["stiching supervisor", "stitching supervisor"]);

    let kajMatch = null;
    if (kLotIdx !== -1) {
      for (let i = 1; i < kajRows.length; i++) {
        const row = kajRows[i];
        if (normalizeLot(row[kLotIdx]) === targetLot) {
          kajMatch = {
            lotNo: targetLot,
            kajDate: formatReadableDate(row[kDateIdx]),
            supervisor: row[kSupIdx] || "",
            totalPcs: row[kPcsIdx] || "",
            aging: row[kAgingIdx] || "",
            status: row[kStatusIdx] || "",
            remarks: row[kRemarksIdx] || "",
            stitchingSupervisor: row[kStitchSupIdx] || ""
          };
          break;
        }
      }
    }

    // 5. MAP BARCODE & RAWPACK SCANS
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

    if (!jobMatch && !indexMatch && !issuesMatch && !kajMatch && !barcodeMatch) {
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
    const bestTotalPcs = indexMatch?.cuttingQty || jobMatch?.totalPcs || kajMatch?.totalPcs || "N/A";

    // Extract Challan Details
    let embPrintChallans = [];
    let embPrintStatus = "Not Required / None";
    let embPrintIssueDate = "";
    let embPrintCompleteDate = "";

    const rawChallan = indexMatch?.challanHistoryRaw || "";
    if (rawChallan) {
      try {
        if (rawChallan.trim().startsWith("[")) {
          const parsed = JSON.parse(rawChallan);
          if (Array.isArray(parsed) && parsed.length > 0) {
            embPrintChallans = parsed;
            const first = parsed[0];
            embPrintIssueDate = formatReadableDate(first.date || first.dateOfIssue || "");
            const last = parsed[parsed.length - 1];
            if (last.embCompleted || last.embUpdatedAt) {
              embPrintCompleteDate = formatReadableDate(last.embUpdatedAt || last.date || "");
              embPrintStatus = "Completed";
            } else {
              embPrintStatus = "In Progress / Pending";
            }
          }
        } else {
          const chMatch = rawChallan.match(/CH-(EMB|PRINT)-\d+/gi);
          if (chMatch) {
            embPrintChallans = chMatch.map((c) => ({ number: c }));
            embPrintStatus = "Challan Created";
          }
        }
      } catch (e) {
        embPrintStatus = "Recorded";
      }
    }

    // Build Milestones with Explicit BOTH Issue & Completion Dates
    const milestones = [];

    // Stage 1: Order / Job Creation
    const hasJob = !!jobMatch || !!indexMatch;
    const jobOrderIssueDate = jobMatch?.jobDate || indexMatch?.cutDate || "N/A";
    const jobOrderCompDate = jobMatch?.jobDate || indexMatch?.cutDate || "Confirmed";
    milestones.push({
      id: "job_order",
      stageNumber: 1,
      title: "Job Order Created",
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

    // Stage 2: Cutting Department
    const hasCut = !!indexMatch?.cutDate;
    const cutIssueDate = jobMatch?.jobDate || indexMatch?.cutDate || "N/A";
    const cutCompleteDate = indexMatch?.cutDate || "Pending";
    milestones.push({
      id: "cutting",
      stageNumber: 2,
      title: "Fabric Cutting",
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

    // Stage 3: Embroidery / Printing
    const hasEmbPrint = embPrintChallans.length > 0 || jobMatch?.embRequired || jobMatch?.printRequired;
    if (hasEmbPrint || rawChallan) {
      const isEmbDone =
        embPrintStatus.toLowerCase().includes("done") ||
        embPrintStatus.toLowerCase().includes("complete") ||
        !!embPrintCompleteDate;
      const embIssueDate = embPrintIssueDate || indexMatch?.cutDate || "Pending";
      const embCompDate = embPrintCompleteDate || (isEmbDone ? embIssueDate : "Pending");
      milestones.push({
        id: "emb_print",
        stageNumber: 3,
        title: "Embroidery / Printing",
        subtitle: isEmbDone ? "Decorations & screens processed" : "Active in EMB/Print Unit",
        icon: "🎨",
        status: isEmbDone ? "completed" : hasCut ? "in_progress" : "pending",
        issueDate: embIssueDate,
        completeDate: embCompDate,
        dwellDays: calculateDaysDiff(embIssueDate, embCompDate),
        details: {
          challans: embPrintChallans,
          statusText: embPrintStatus
        }
      });
    }

    // Stage 4: Stitching Line Allocation & Floor Assembly
    const hasStitchIssue = !!indexMatch?.dateOfIssue;
    const hasStitchComplete =
      !!indexMatch?.completedStatus &&
      indexMatch.completedStatus !== "-" &&
      !indexMatch.completedStatus.toLowerCase().includes("pending");
    const stitchIssueDate = indexMatch?.dateOfIssue || "Pending";
    const stitchCompleteDate = indexMatch?.completedStatus || (hasStitchComplete ? "Completed" : "In Progress");

    milestones.push({
      id: "stitching",
      stageNumber: 4,
      title: "Stitching Department",
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

    // Stage 5: Kaj Button & Secondary Work
    const hasKaj = !!kajMatch;
    const isKajDone =
      kajMatch?.status?.toLowerCase().includes("complete") ||
      kajMatch?.status?.toLowerCase().includes("done") ||
      !!issuesMatch?.pkgDate;
    const kajIssueDate = kajMatch?.kajDate || indexMatch?.completedStatus || "Pending";
    const kajCompDate = isKajDone ? (issuesMatch?.pkgDate || kajMatch?.kajDate || "Completed") : "In Progress";

    milestones.push({
      id: "kaj_button",
      stageNumber: 5,
      title: "Kaj Button & Secondary Work",
      subtitle: kajMatch?.supervisor ? `Supervisor: ${kajMatch.supervisor}` : "Button attachment & inspection",
      icon: "🔘",
      status: isKajDone ? "completed" : hasStitchComplete ? "in_progress" : "pending",
      issueDate: kajIssueDate,
      completeDate: kajCompDate,
      dwellDays: calculateDaysDiff(kajIssueDate, kajCompDate),
      details: {
        supervisor: kajMatch?.supervisor || "N/A",
        totalPcs: kajMatch?.totalPcs || bestTotalPcs,
        agingDays: kajMatch?.aging || "0",
        remarks: kajMatch?.remarks || "None",
        status: kajMatch?.status || (isKajDone ? "Completed" : "Pending")
      }
    });

    // Stage 6: Packing & Carton Boxing
    const hasPkgIssue = !!issuesMatch?.pkgDate;
    const hasPkgComplete =
      !!issuesMatch?.packingComplete &&
      issuesMatch.packingComplete !== "-" &&
      !issuesMatch.packingComplete.toLowerCase().includes("pending");
    const hasBarcode = !!barcodeMatch;
    const isFullyComplete = hasPkgComplete || hasBarcode;

    const pkgIssueDate = issuesMatch?.pkgDate || "Pending";
    const pkgCompDate = issuesMatch?.packingComplete || barcodeMatch?.barcodeDate || (isFullyComplete ? "Completed" : "In Progress");

    milestones.push({
      id: "packing",
      stageNumber: 6,
      title: "Packing & Finishing",
      subtitle: issuesMatch?.pkgSupervisor ? `Supervisor: ${issuesMatch.pkgSupervisor}` : "Carton boxing & sticker allocation",
      icon: "📦",
      status: isFullyComplete ? "completed" : hasPkgIssue ? "in_progress" : "pending",
      issueDate: pkgIssueDate,
      completeDate: pkgCompDate,
      dwellDays: calculateDaysDiff(pkgIssueDate, pkgCompDate),
      details: {
        supervisor: issuesMatch?.pkgSupervisor || "N/A",
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
        image: indexMatch?.image || ""
      },
      milestones
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
