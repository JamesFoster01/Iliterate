require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");

const path = require("path");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

// --------------------
// Local DB (LowDB)
// --------------------
const adapter = new JSONFile(path.join(__dirname, "db.json"));
const db = new Low(adapter, { usage: {}, proUsers: {} });

async function initDb() {
  await db.read();
  db.data ||= { usage: {}, proUsers: {} };
  await db.write();
}
initDb();

const FREE_LIMIT = 5;

// --------------------
// App setup
// --------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_CHARS = 3000;

// --------------------
// Routes
// --------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/summarize", async (req, res) => {
  try {
    const { text, keyword, userId, mode } = req.body || {};
    const m = (typeof mode === "string" ? mode : "essay").toLowerCase();
    const isExam = m === "exam";

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Missing or invalid userId" });
    }

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid text" });
    }

    const originalLength = text.length;
    const processedText = text.slice(0, MAX_CHARS);
    const processedLength = processedText.length;
    const wasCapped = originalLength > MAX_CHARS;

    const hasKeyword =
      keyword && typeof keyword === "string" && keyword.trim().length > 0;
    const kw = hasKeyword ? keyword.trim() : null;

    // =========================
    // FREE LIMIT CHECK (5/month)
    // =========================
    await db.read();

    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    db.data.usage[userId] ||= {};
    db.data.usage[userId][monthKey] ||= 0;

    const isPro = !!db.data.proUsers[userId];

    if (!isPro && db.data.usage[userId][monthKey] >= FREE_LIMIT) {
      return res.status(402).json({
        error: "LIMIT_REACHED",
        limit: FREE_LIMIT,
        month: monthKey,
      });
    }

    // Count this request
    db.data.usage[userId][monthKey] += 1;
    await db.write();

    const system =
      "You are a study assistant. Be accurate. Do not invent details.";

    const userPrompt = `You must ONLY use information from the provided TEXT.

====================
SECTION 1 — MAIN NOTES (${isExam ? "EXAM MODE" : "ESSAY MODE"})
====================

${
  isExam
    ? `EXAM MODE (STRICT RULES):
- NO full sentences.
- NO explanations.
- NO adjectives or opinions.
- Each bullet must be a short factual fragment.
- Use formats like:
  • YEAR – EVENT
  • NAME → OUTCOME
  • WORK → PERSON
- Think: what would I memorise the night before an exam?

Write 8–14 bullets.`
    : `ESSAY MODE (STRICT RULES):
- Full sentences only.
- Each bullet should contain context or cause/effect.
- Written so it could be expanded into a paragraph.
- Academic but clear tone.

Write 6–10 bullets.`
}

====================
SECTION 2 — FOCUS: "${kw || "N/A"}"
====================

${
  kw
    ? `${
        isExam
          ? `EXAM FOCUS RULES:
- Same fragment-style bullets.
- 3–5 bullets.
- Facts only, no explanation.`
          : `ESSAY FOCUS RULES:
- Full sentences.
- Explain how the keyword fits into the text.
- 3–5 bullets.`
      }`
    : `Skip this section if no keyword.`
}

RULES:
- Do not invent information.
- Stay under 220 words total.

TEXT:
${processedText}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    const summary =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No summary returned.";

    res.json({
      summary,
      metadata: {
        originalLength,
        processedLength,
        wasCapped,
        keyword: kw,
        userId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("SUMMARIZE ERROR:", err?.message || err);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
