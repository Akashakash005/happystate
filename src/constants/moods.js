export const MOOD_OPTIONS = [
  { value: 1, label: 'Very Low', color: '#DC2626' },
  { value: 2, label: 'Low', color: '#F97316' },
  { value: 3, label: 'Neutral', color: '#F59E0B' },
  { value: 4, label: 'Good', color: '#22C55E' },
  { value: 5, label: 'Great', color: '#16A34A' },
];

export const getMoodMeta = (value) =>
  MOOD_OPTIONS.find((m) => m.value === value) || MOOD_OPTIONS[2];
