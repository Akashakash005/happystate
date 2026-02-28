import {
  JOURNAL_ANALYSIS_SYSTEM_PROMPT,
  NAME_EXTRACTION_SYSTEM_PROMPT,
  buildJournalUserPrompt,
  buildNameExtractionUserPrompt,
} from "../constants/aiPrompts";
import { buildJournalContext } from "./journalContextService";

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || "gemini-2.5-flash";
const ALLOWED_MOOD_TAGS = new Set([
  "happy",
  "stressed",
  "calm",
  "neutral",
  "sad",
  "anxious",
  "angry",
  "grateful",
  "tired",
  "overwhelmed",
]);

function normalizeSentiment(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(-1, Math.min(1, parsed));
}

function safeJsonParse(text) {
  if (!text) return null;

  const cleaned = String(text)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeMoodTag(tag) {
  const normalized = String(tag || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "neutral";
  if (ALLOWED_MOOD_TAGS.has(normalized)) return normalized;
  if (normalized.includes("stress") || normalized.includes("anxious"))
    return "stressed";
  if (normalized.includes("calm") || normalized.includes("peace"))
    return "calm";
  if (normalized.includes("happy") || normalized.includes("joy"))
    return "happy";
  return "neutral";
}

function sanitizeQuestions(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  return [...new Set(cleaned)];
}

function sanitizeSingleQuestion(value) {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned;
}

function validateJournalAnalysisPayload(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;

  const reflection =
    typeof parsed.reflection === "string" ? parsed.reflection.trim() : "";
  if (!reflection) return null;

  return {
    reflection,
    moodTag: normalizeMoodTag(parsed.moodTag),
    sentiment: normalizeSentiment(parsed.sentiment),
    followUpQuestion:
      sanitizeSingleQuestion(parsed.followUpQuestion) ||
      sanitizeQuestions(parsed.suggestedQuestions)[0] ||
      "What feels most important to explore next?",
  };
}

function validateNameExtractionPayload(parsed) {
  if (Array.isArray(parsed)) {
    return [
      ...new Set(
        parsed
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }

  if (Array.isArray(parsed?.names)) {
    return [
      ...new Set(
        parsed.names
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }

  return null;
}

async function geminiChat({ systemPrompt, userPrompt, temperature = 0.3 }) {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nReturn strict JSON only.`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: { temperature, responseMimeType: "application/json" },
        contents: [{ parts: [{ text: fullPrompt }] }],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Gemini request failed.");
  }

  const payload = await response.json();
  return (
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("\n")
      .trim() || ""
  );
}

async function modelChat(params) {
  if (GEMINI_API_KEY) {
    return geminiChat(params);
  }
  throw new Error("No AI API key configured for journal service.");
}

function fallbackAnalysis(entryText) {
  const lower = entryText.toLowerCase();
  const negative = [
    "stressed",
    "anxious",
    "sad",
    "angry",
    "tired",
    "overwhelmed",
  ];
  const positive = ["happy", "calm", "grateful", "relaxed", "good", "excited"];

  let score = 0;
  positive.forEach((w) => {
    if (lower.includes(w)) score += 0.2;
  });
  negative.forEach((w) => {
    if (lower.includes(w)) score -= 0.2;
  });

  const sentiment = Math.max(-1, Math.min(1, Number(score.toFixed(2))));

  let moodTag = "neutral";
  if (sentiment >= 0.35) moodTag = "happy";
  else if (sentiment <= -0.35) moodTag = "stressed";
  else if (sentiment > 0.1) moodTag = "calm";

  return {
    reflection:
      "Thanks for sharing. I can see meaningful emotional signals in what you wrote.",
    moodTag,
    sentiment,
    followUpQuestion: "What part of this moment feels most important to you right now?",
  };
}

function fallbackExtractNames(text) {
  const matches = String(text).match(/\b[A-Z][a-z]+\b/g) || [];
  const stopWords = new Set([
    "I",
    "Today",
    "Yesterday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]);
  return [...new Set(matches.filter((word) => !stopWords.has(word)))];
}

export async function analyzeJournalEntry(entryText) {
  return analyzeJournalEntryWithContext(entryText, { history: [] });
}

export async function analyzeJournalEntryWithContext(entryText, options = {}) {
  const history = Array.isArray(options.history) ? options.history : [];

  try {
    let context = {};
    try {
      context = await buildJournalContext({ history });
    } catch {
      context = {};
    }
    const content = await modelChat({
      systemPrompt: JOURNAL_ANALYSIS_SYSTEM_PROMPT,
      userPrompt: buildJournalUserPrompt({ entryText, history, context }),
      temperature: 0.25,
    });
    const parsed = safeJsonParse(content);
    const normalized = validateJournalAnalysisPayload(parsed);
    if (!normalized) {
      return fallbackAnalysis(entryText);
    }

    return normalized;
  } catch {
    return fallbackAnalysis(entryText);
  }
}

export async function extractPeopleNames(text) {
  if (!String(text).trim()) return [];

  try {
    const content = await modelChat({
      systemPrompt: NAME_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: buildNameExtractionUserPrompt(text),
      temperature: 0,
    });

    const parsed = safeJsonParse(content);
    const normalized = validateNameExtractionPayload(parsed);
    if (normalized) return normalized;

    return fallbackExtractNames(text);
  } catch {
    return fallbackExtractNames(text);
  }
}
