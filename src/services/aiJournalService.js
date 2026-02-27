import {
  JOURNAL_ANALYSIS_SYSTEM_PROMPT,
  NAME_EXTRACTION_SYSTEM_PROMPT,
  buildJournalUserPrompt,
  buildNameExtractionUserPrompt,
} from '../constants/aiPrompts';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.EXPO_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini';

function normalizeSentiment(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(-1, Math.min(1, parsed));
}

function safeJsonParse(text) {
  if (!text) return null;

  const cleaned = String(text)
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function openAIChat({ systemPrompt, userPrompt, temperature = 0.3 }) {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_OPENAI_API_KEY.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'OpenAI request failed.');
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content?.trim() || '';
}

function fallbackAnalysis(entryText) {
  const lower = entryText.toLowerCase();
  const negative = ['stressed', 'anxious', 'sad', 'angry', 'tired', 'overwhelmed'];
  const positive = ['happy', 'calm', 'grateful', 'relaxed', 'good', 'excited'];

  let score = 0;
  positive.forEach((w) => {
    if (lower.includes(w)) score += 0.2;
  });
  negative.forEach((w) => {
    if (lower.includes(w)) score -= 0.2;
  });

  const sentiment = Math.max(-1, Math.min(1, Number(score.toFixed(2))));

  let moodTag = 'neutral';
  if (sentiment >= 0.35) moodTag = 'happy';
  else if (sentiment <= -0.35) moodTag = 'stressed';
  else if (sentiment > 0.1) moodTag = 'calm';

  return {
    reflection: 'Thanks for sharing. I can see meaningful emotional signals in what you wrote.',
    moodTag,
    sentiment,
    suggestedQuestions: [
      'What part of this moment felt most important to you?',
      'What one small action could support you next?',
    ],
  };
}

function fallbackExtractNames(text) {
  const matches = String(text).match(/\b[A-Z][a-z]+\b/g) || [];
  const stopWords = new Set(['I', 'Today', 'Yesterday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  return [...new Set(matches.filter((word) => !stopWords.has(word)))];
}

export async function analyzeJournalEntry(entryText) {
  return analyzeJournalEntryWithContext(entryText, { history: [] });
}

export async function analyzeJournalEntryWithContext(entryText, options = {}) {
  const history = Array.isArray(options.history) ? options.history : [];

  try {
    const content = await openAIChat({
      systemPrompt: JOURNAL_ANALYSIS_SYSTEM_PROMPT,
      userPrompt: buildJournalUserPrompt({ entryText, history }),
      temperature: 0.4,
    });

    const parsed = safeJsonParse(content);
    if (!parsed) {
      return fallbackAnalysis(entryText);
    }

    return {
      reflection:
        typeof parsed.reflection === 'string' && parsed.reflection.trim()
          ? parsed.reflection.trim()
          : 'Thank you for sharing this.',
      moodTag: typeof parsed.moodTag === 'string' ? parsed.moodTag.toLowerCase() : 'neutral',
      sentiment: normalizeSentiment(parsed.sentiment),
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
        ? parsed.suggestedQuestions.filter((q) => typeof q === 'string').slice(0, 4)
        : [],
    };
  } catch {
    return fallbackAnalysis(entryText);
  }
}

export async function extractPeopleNames(text) {
  if (!String(text).trim()) return [];

  try {
    const content = await openAIChat({
      systemPrompt: NAME_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: buildNameExtractionUserPrompt(text),
      temperature: 0,
    });

    const parsed = safeJsonParse(content);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.filter((name) => typeof name === 'string' && name.trim()))];
    }

    if (Array.isArray(parsed?.names)) {
      return [...new Set(parsed.names.filter((name) => typeof name === 'string' && name.trim()))];
    }

    return fallbackExtractNames(text);
  } catch {
    return fallbackExtractNames(text);
  }
}
