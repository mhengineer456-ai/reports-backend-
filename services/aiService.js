// backend/services/aiService.js
const axios = require("axios");
const config = require("../config");

/**
 * AI Service for Factory Suite Pro
 * Unified Intelligent Assistant:
 * 1. Handles full factory dataset queries across Cutting, Embroidery, Printing, Stitching, Packing, Fabric, Yarn, etc.
 * 2. Handles general textile/garment knowledge, formulas, math, and conversational queries (without factory data).
 * 3. Supports Google Gemini API & OpenAI API keys when configured.
 */

/**
 * Query AI model with context data from factory reports
 * @param {string} prompt - User query in Hinglish/English/Hindi
 * @param {object} context - Global factory context summary and sample lots data
 * @param {string} apiKey - Optional Gemini API key passed from client or environment
 * @returns {Promise<object>} - AI response
 */
async function queryReportAI(prompt, context = {}, apiKey = "") {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    return {
      success: false,
      error: "Prompt cannot be empty"
    };
  }

  // Reload dotenv dynamically to capture updated .env keys without restarting server
  // 1. Try Python FastAPI + Pandas + LangChain microservice if online
  try {
    const pythonRes = await axios.post("http://127.0.0.1:8000/api/ai/query", {
      query: cleanPrompt
    }, { timeout: 8000 });
    if (pythonRes.data && pythonRes.data.success && pythonRes.data.answer) {
      return {
        success: true,
        answer: pythonRes.data.answer,
        source: "python_fastapi_langchain",
        model: "Python FastAPI + Pandas + LangChain"
      };
    }
  } catch (pyErr) {
    // Python service is offline or starting; fallback gracefully to direct Node.js Gemini engine
  }

  const geminiKey = (apiKey || process.env.GEMINI_API_KEY || process.env.REACT_APP_GOOGLE_API_KEY || config.geminiApiKey || "").trim();

  // 2. Try Gemini API if API key is provided and looks valid
  if (geminiKey && geminiKey.length > 10) {
    try {
      const historyStr = (context.history && Array.isArray(context.history))
        ? "\n\nPrior Chat History:\n" + context.history.slice(-8).map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join("\n")
        : "";

      const systemInstruction = `You are "Factory AI Copilot", an expert production management, industrial engineering, and analytics assistant for garment manufacturing (Factory Suite Pro) built like ChatGPT and Gemini.
You converse fluently and warmheartedly in Hinglish, Hindi, or English (always match the user's language).

Capabilities:
1. **Whole Factory Data Queries:** If the user asks about production lots, stages (Cutting, Embroidery, Printing, Stitching, Packing), delays, pieces, or bottleneck red zones, analyze the provided Factory Context and give exact counts, quantities, and lot breakdowns.
2. **General Knowledge & Textile Science:** If the user asks general questions (e.g. GSM formula, fabric shrinkage calculation, SAM/SMV, wastage %, overlock vs flatlock, yarn count, machine maintenance, general math, or conversational questions), answer thoroughly, clearly, and practically.
3. Tone: Professional, friendly, concise, in the user's preferred language (Hinglish/Hindi/English).

Current Factory Context:
- Active Stage: ${context.activeStage || 'All Stages'}
- Total Loaded Production Lots: ${context.totalLotsCount || 0}
- Production KPIs: ${JSON.stringify(context.summaryKPIs || {})}
- Sample Bottleneck Lots: ${JSON.stringify((context.sampleLots || []).slice(0, 50))}${historyStr}`;

      const modelsToTry = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-flash"];
      let candidate = null;

      for (const modelName of modelsToTry) {
        try {
          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
            {
              contents: [
                {
                  role: "user",
                  parts: [{ text: `${systemInstruction}\n\nUser Question: ${cleanPrompt}` }]
                }
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1200
              }
            },
            {
              timeout: 5000,
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiKey
              }
            }
          );

          candidate = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate) break;
        } catch (mErr) {
          const status = mErr?.response?.status;
          if (status === 401 || status === 403) {
            console.warn(`[AIService] Gemini API key rejected (${status}). Using built-in reasoning engine.`);
            break;
          }
          continue;
        }
      }

      if (candidate) {
        return {
          success: true,
          source: "gemini",
          answer: candidate
        };
      }
    } catch (err) {
      console.warn("[AIService] Gemini API error, falling back to built-in reasoning brain:", err.message);
    }
  }

  // 2. Comprehensive Built-in Reasoning & Manufacturing Knowledge Brain
  const answer = generateComprehensiveResponse(cleanPrompt, context);
  return {
    success: true,
    source: "factory-brain",
    answer: answer.text,
    metrics: answer.metrics,
    matchingLotNos: answer.matchingLotNos
  };
}

/**
 * Intelligent Multi-Domain Brain: Handles both Factory Data and General/Textile Knowledge
 */
  // =========================================================================
  // A. CONVERSATIONAL & GENERAL KNOWLEDGE ENGINE
  // =========================================================================

  // 1. Polite & Conversational Greetings
  if (p === "hi" || p === "hello" || p === "namaste" || p === "hey" || p.startsWith("hello") || p.startsWith("hi ") || p === "hlo" || p === "hy") {
    return {
      text: `Namaste! 👋 Main Factory AI Assistant hoon.\n\nMain aapke **Factory Suite Pro** ke saare reports (Cutting, Embroidery, Printing, Stitching, Packing, Lots) aur garment manufacturing calculations me help kar sakta hoon.\n\nAap aaj production bottlenecks check karna chahte hain, ya kisi specific lot ka status janna chahte hain?`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // 2. Well-being & Current Activity
  if (p.includes("kaise ho") || p.includes("kya haal") || p.includes("how are you") || p.includes("sab badhiya") || p.includes("kya kr rhe ho") || p.includes("kya kar rahe ho") || p.includes("what are you doing") || p.includes("kya chal raha")) {
    return {
      text: `Main Factory Suite Pro ke saare production stages (Cutting, Embroidery, Printing, Stitching, Packing) ka live data monitor kar raha hoon aur aapke sawalon ke jawab dene ke liye taiyar hoon! 🚀\n\nAap kisi specific lot ka status check karna chahte hain, ya production bottleneck dekhna chahte hain?`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // 3. Gratitude & Thanks
  if (p.includes("thank") || p.includes("shukriya") || p.includes("dhanyawad") || p.includes("good job") || p.includes("nice")) {
    return {
      text: `Aapka swagat hai! 😊 Agar production analysis, delayed lots, ya textile formulas me aur koi zaroorat ho, toh bina jhijhak puchiye.`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // 4. GSM Calculation
  if (p.includes("gsm") || p.includes("fabric weight") || p.includes("gram per square meter")) {
    return {
      text: `### 🧵 GSM (Grams per Square Meter) Calculation Guide\n\n` +
        `**Formula:**\n` +
        `• $\\text{GSM} = \\frac{\\text{Weight of Sample (grams)}}{\\text{Area (sq. meters)}} = \\frac{\\text{Weight in Grams} \\times 10,000}{\\text{Length (cm)} \\times \\text{Width (cm)}}$\n\n` +
        `**Quick GSM Round-Cutter Method:**\n` +
        `• 100 cm² Round GSM Cutter se sample cut karein.\n` +
        `• Electronic balance par weigh karein.\n` +
        `• $\\text{GSM} = \\text{Weight (grams)} \\times 100$\n\n` +
        `**Standard Garment GSM Ranges:**\n` +
        `• **Single Jersey T-Shirt:** 160 – 190 GSM\n` +
        `• **Pique Polo:** 200 – 240 GSM\n` +
        `• **Fleece / Hoodie:** 280 – 360 GSM\n` +
        `• **Rib / Collar:** 220 – 260 GSM`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // 5. Fabric Consumption Formula
  if (p.includes("consumption") || p.includes("fabric required") || p.includes("kitna kapda") || p.includes("kapda calculation")) {
    return {
      text: `### 📐 Garment Fabric Consumption Calculation\n\n` +
        `**Basic T-Shirt Fabric Consumption (in Kg / Dozen):**\n` +
        `• $\\text{Grams/Pc} = \\frac{(\\text{Length} + \\text{Allowance}) \\times (\\text{Chest} + \\text{Allowance}) \\times 2 \\times \\text{GSM}}{10,000} + \\text{Sleeve Consumption}$\n\n` +
        `**Standard Estimations (per piece):**\n` +
        `• **Half Sleeve T-Shirt (180 GSM):** ~180 to 220 grams (4.5 – 5.5 pcs per Kg)\n` +
        `• **Full Sleeve T-Shirt (180 GSM):** ~240 to 280 grams (3.5 – 4.2 pcs per Kg)\n` +
        `• **Polo T-Shirt (220 GSM):** ~280 to 330 grams\n` +
        `• **Lower / Trackpant (240 GSM):** ~320 to 380 grams\n` +
        `• **Hoodie / Sweatshirt (320 GSM Fleece):** ~550 to 700 grams\n\n` +
        `*Tip: Standard cutting wastage allowance 3% to 5% zaroor add karein.*`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // 6. Shrinkage Calculation
  if (p.includes("shrinkage") || p.includes("sikudna") || p.includes("wash shrinkage")) {
    return {
      text: `### 🧪 Fabric Wash Shrinkage Formula\n\n` +
        `**Formula:**\n` +
        `• $\\text{Shrinkage \\%} = \\frac{\\text{Original Length} - \\text{Length after Wash}}{\\text{Original Length}} \\times 100$\n\n` +
        `**Testing Procedure:**\n` +
        `1. 50cm × 50cm benchmark mark karein.\n` +
        `2. Standard wash & dry cycle perform karein.\n` +
        `3. Post-wash measurement lekar length & width shrinkage calculate karein.\n` +
        `• **Acceptable Limit for Knits:** Length ±4% to 5%, Width ±3% to 4%.`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // 7. SAM / SMV & Line Efficiency
  if (p.includes("sam") || p.includes("smv") || p.includes("efficiency") || p.includes("line output") || p.includes("pitch time")) {
    return {
      text: `### ⏱️ Stitching Line Efficiency & SAM Formula\n\n` +
        `**1. Line Efficiency Formula:**\n` +
        `• $\\text{Efficiency \\%} = \\frac{\\text{Total Output (Pcs)} \\times \\text{SAM (Minutes)}}{\\text{Total Operators} \\times \\text{Working Hours} \\times 60} \\times 100$\n\n` +
        `**2. Pitch Time (Takt Time):**\n` +
        `• $\\text{Pitch Time} = \\frac{\\text{Total SAM (Minutes)}}{\\text{Number of Operators}}$\n\n` +
        `**Benchmark SAM Values:**\n` +
        `• **Basic T-Shirt:** 10 – 14 SAM\n` +
        `• **Polo T-Shirt:** 18 – 24 SAM\n` +
        `• **Trackpant:** 16 – 20 SAM\n` +
        `• **Hoodie with Zipper:** 28 – 35 SAM`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // 8. Quality / DHU & AQL
  if (p.includes("dhu") || p.includes("aql") || p.includes("defect") || p.includes("quality")) {
    return {
      text: `### 🎯 Garment Quality & DHU Calculation\n\n` +
        `**DHU (Defects per Hundred Units) Formula:**\n` +
        `• $\\text{DHU} = \\frac{\\text{Total Defects Found}}{\\text{Total Garments Inspected}} \\times 100$\n\n` +
        `**AQL Standards (Acceptable Quality Limit):**\n` +
        `• **AQL 2.5:** Major Defects ke liye standard export benchmark.\n` +
        `• **AQL 4.0:** Minor Defects ke liye standard acceptance limit.`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // 9. Basic Math Evaluation (e.g. 500 * 12 or 2400 / 6)
  const mathMatch = p.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/xX])\s*(\d+(?:\.\d+)?)/);
  if (mathMatch && !p.includes("lot") && !p.includes("stage")) {
    const n1 = parseFloat(mathMatch[1]);
    const op = mathMatch[2].toLowerCase();
    const n2 = parseFloat(mathMatch[3]);
    let result = 0;
    if (op === "+") result = n1 + n2;
    else if (op === "-") result = n1 - n2;
    else if (op === "*" || op === "x") result = n1 * n2;
    else if (op === "/" && n2 !== 0) result = n1 / n2;

    return {
      text: `### 🔢 Calculation Result\n\n` +
        `• **Expression:** ${n1} ${op} ${n2}\n` +
        `• **Answer:** **${Number.isInteger(result) ? result.toLocaleString() : result.toFixed(2)}**`,
      metrics: null,
      matchingLotNos: []
    };
  }

  // =========================================================================
  // B. FACTORY DATA QUERY ENGINE (CUTTING, EMBROIDERY, STITCHING, PACKING)
  // =========================================================================
  let filtered = [...sampleLots];

  // Stage filters
  let stageName = "";
  if (p.includes("cut") || p.includes("cutting") || p.includes("katayi")) {
    stageName = "Cutting";
    filtered = filtered.filter(l => (l.stage || "").toLowerCase().includes("cut"));
  } else if (p.includes("emb") || p.includes("embroidery") || p.includes("kadhai") || p.includes("embroidary")) {
    stageName = "Embroidery";
    filtered = filtered.filter(l => (l.stage || "").toLowerCase().includes("emb"));
  } else if (p.includes("print") || p.includes("printing") || p.includes("chapai")) {
    stageName = "Printing";
    filtered = filtered.filter(l => (l.stage || "").toLowerCase().includes("print"));
  } else if (p.includes("post") || p.includes("after emb") || p.includes("issue to stitch")) {
    stageName = "Post-EMB/Print Issue";
    filtered = filtered.filter(l => (l.stage || "").toLowerCase().includes("post") || (l.stage || "").toLowerCase().includes("pending issue"));
  } else if (p.includes("stitch") || p.includes("silai") || p.includes("stitching")) {
    stageName = "Stitching";
    filtered = filtered.filter(l => (l.stage || "").toLowerCase().includes("stitch"));
  } else if (p.includes("pack") || p.includes("packing")) {
    stageName = "Packing Handover";
    filtered = filtered.filter(l => (l.stage || "").toLowerCase().includes("pack"));
  }

  // Item / Sleeve / Keyword filter
  if (/\b(ss|s\/s)\b/i.test(p)) {
    filtered = filtered.filter(l => {
      const str = `${l.item || ''} ${l.party || ''} ${l.description || ''} ${l.lotNo || ''}`.toLowerCase();
      return str.includes("ss") || str.includes("short sleeve");
    });
  } else if (/\b(fs|f\/s)\b/i.test(p)) {
    filtered = filtered.filter(l => {
      const str = `${l.item || ''} ${l.party || ''} ${l.description || ''} ${l.lotNo || ''}`.toLowerCase();
      return str.includes("fs") || str.includes("full sleeve");
    });
  }

  // Days threshold
  const daysMatch = p.match(/(\d+)\s*(din|days?|d)/i);
  if (daysMatch) {
    const minDays = parseInt(daysMatch[1], 10);
    filtered = filtered.filter(l => (parseFloat(l.pendingDays || l.delayDays) || 0) >= minDays);
  } else if (p.includes("critical") || p.includes("red zone")) {
    filtered = filtered.filter(l => (parseFloat(l.pendingDays || l.delayDays) || 0) >= 3 || (l.severity || "").includes("CRITICAL"));
  }

  // Specific Lot Number lookup
  const ignoreWords = new Set([
    "kitna", "kitne", "kya", "kisko", "kiska", "kaunsa", "konsa", "pending", "pening", "hai", "h",
    "status", "detail", "details", "list", "ka", "ke", "ki", "me", "pr", "pe", "par", "kis",
    "process", "stage", "chal", "rha", "raha", "kaha", "kisme", "batao", "dikhao"
  ]);

  let searchedLotNo = null;
  const numBeforeLot = p.match(/\b([a-zA-Z0-9_\-\/]{3,12})\s+lots?\b/i);
  if (numBeforeLot && /\d/.test(numBeforeLot[1])) {
    searchedLotNo = numBeforeLot[1].toLowerCase().trim();
  }

  if (!searchedLotNo) {
    const lotAfter = p.match(/\blots?\s*(?:no\.?|#|num|number)?\s*([a-zA-Z0-9_\-\/]+)/i);
    if (lotAfter && lotAfter[1]) {
      const cand = lotAfter[1].toLowerCase().trim();
      if (!ignoreWords.has(cand) && (/\d/.test(cand) || cand.length >= 3)) {
        searchedLotNo = cand;
      }
    }
  }

  if (!searchedLotNo) {
    const standalone = p.match(/\b(\d{4,7}|[a-zA-Z]{1,3}[-_]\d{3,6})\b/i);
    if (standalone && !p.includes("gsm") && !p.includes("sam")) {
      searchedLotNo = standalone[1].toLowerCase().trim();
    }
  }

  if (searchedLotNo) {
    const exactMatches = sampleLots.filter(l => String(l.lotNo || "").toLowerCase().trim() === searchedLotNo);
    const directMatches = exactMatches.length > 0 ? exactMatches : sampleLots.filter(l => String(l.lotNo || "").toLowerCase().includes(searchedLotNo));

    if (directMatches.length > 0) {
      const found = directMatches[0];
      const days = parseFloat(found.pendingDays || found.delayDays || 0) || 0;
      const qtyFormatted = (parseFloat(found.qty) || 0).toLocaleString();

      return {
        text: `### 📍 Lot #${found.lotNo} Current Status\n\n` +
          `• **Current Process / Stage:** **${found.stage || 'Production WIP'}**\n` +
          `• **Party Name:** **${found.party || 'Standard'}**\n` +
          `• **Garment / Item:** ${found.item || 'Standard Garment'}\n` +
          `• **Quantity:** **${qtyFormatted} Pcs**\n` +
          `• **Process Time:** ⏳ **${days} Days**\n` +
          `• **Status:** ${found.status || 'Active in WIP'}`,
        metrics: { totalLots: 1, totalQty: parseFloat(found.qty) || 0 },
        matchingLotNos: [found.lotNo]
      };
    } else {
      return {
        text: `🔍 **Lot #${searchedLotNo.toUpperCase()} Status Not Found**\n\n` +
          `• Lot **#${searchedLotNo.toUpperCase()}** factory production records mein nahi mila.\n` +
          `• **Possible Reasons:**\n` +
          `  1. Lot number me typing mistake ho sakti hai.\n` +
          `  2. Lot abhi JobOrder sheet me create nahi hua hai ya dispatch ho chuka hai.\n` +
          `• **Tip:** Aap JobOrder ya Cutting report me lot number verify karein.`,
        metrics: { totalLots: 0, totalQty: 0 },
        matchingLotNos: []
      };
    }
  }

  // Sort by pending days / qty descending
  filtered.sort((a, b) => (parseFloat(b.pendingDays || b.delayDays || 0) - parseFloat(a.pendingDays || a.delayDays || 0)));

  const totalLots = filtered.length;
  const totalQty = filtered.reduce((sum, l) => sum + (parseFloat(l.qty || l.pieces || 0) || 0), 0);
  const matchingLotNos = filtered.map(l => l.lotNo).filter(Boolean);

  let responseText = "";
  if (totalLots === 0) {
    responseText = `🔍 **Search Result:** Aapki query ke matching koi pending lot nahi mila.\n\n` +
      `• **Context:** ${stageName ? `Stage: **${stageName}**` : "All Factory Stages"}\n` +
      `• **Tip:** Aap stage change karke ya broader query search kar sakte hain. Agar general textile/manufacturing sawal hai toh seedha puchiye!`;
  } else {
    responseText = `📊 **Report Analysis Summary:**\n`;
    responseText += `• **Total Matching Lots:** **${totalLots} lots**\n`;
    responseText += `• **Total Quantity:** **${totalQty.toLocaleString()} Pcs**\n`;
    if (stageName) responseText += `• **Stage:** **${stageName}**\n`;
    responseText += `\n**Top Pending Lots Detail:**\n`;

    filtered.slice(0, 8).forEach((lot, i) => {
      const days = lot.pendingDays || lot.delayDays || 0;
      responseText += `${i + 1}. **Lot #${lot.lotNo}** | ${lot.party || lot.item || 'Standard'} | **${lot.qty || 0} pcs** | Stage: ${lot.stage || stageName || 'WIP'} | ⏳ **${days} days pending**\n`;
    });

    if (totalLots > 8) {
      responseText += `\n*...aur ${totalLots - 8} aur lots hain.*`;
    }

    responseText += `\n\n💡 **Action Recommendation:** In lots ko expedite karein taaki production bottleneck clear ho sake.`;
  }

  return {
    text: responseText,
    metrics: { totalLots, totalQty },
    matchingLotNos
  };
}

module.exports = {
  queryReportAI
};
