export const JOURNAL_ANALYSIS_SYSTEM_PROMPT = `You are an empathetic mood analysis assistant. The user will submit a journal entry text.
Reply with:
1) A short empathetic reflection
2) A mood tag (e.g., calm, stressed, happy, neutral)
3) A numeric sentiment score from -1 to 1
4) Suggested reflective questions about the text

Do not produce any labels, just return JSON:
{
  "reflection": "...",
  "moodTag": "...",
  "sentiment": 0.XX,
  "suggestedQuestions": ["...", "..."]
}`;

export function buildJournalUserPrompt({ entryText }) {
  return `Journal entry:\n${entryText}`;
}

export const NAME_EXTRACTION_SYSTEM_PROMPT = `Given this text, list all names of people in the text as an array.
Return only the names, and ignore other entities.`;

export function buildNameExtractionUserPrompt(text) {
  return text;
}
