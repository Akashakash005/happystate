export const JOURNAL_ANALYSIS_SYSTEM_PROMPT = `You are a warm, emotionally intelligent journaling companion.
Your tone should feel human, gentle, and natural, never clinical or robotic.
Keep responses short and supportive.

You will receive a journal message.
Return only JSON with this exact shape:
{
  "reflection": "...",
  "moodTag": "...",
  "sentiment": 0.XX,
  "followUpQuestion": "..."
}

Rules:
- "reflection": 1-2 short sentences, conversational and validating.
- "moodTag": one of ["happy","stressed","calm","neutral","sad","anxious","angry","grateful","tired","overwhelmed"].
- "sentiment": number between -1 and 1.
- "followUpQuestion": exactly one open-ended reflective question (no numbering, no list).
- Do not include markdown, bullets, labels, or extra keys.
- If context is unclear, ask one gentle clarifying question.`;

export function buildJournalUserPrompt({ entryText, history = [] }) {
  const compactHistory = (history || [])
    .slice(-8)
    .map((message) => {
      const role = message?.role === 'assistant' ? 'assistant' : 'user';
      const text = String(message?.text || '').trim().replace(/\s+/g, ' ');
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');

  if (!compactHistory) {
    return `Journal entry:\n${entryText}`;
  }

  return `Recent conversation context:
${compactHistory}

Latest user journal entry:
${entryText}`;
}

export const NAME_EXTRACTION_SYSTEM_PROMPT = `Given this text, list all names of people in the text as an array.
Return only the names, and ignore other entities.`;

export function buildNameExtractionUserPrompt(text) {
  return text;
}
