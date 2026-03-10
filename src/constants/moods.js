export const MOOD_OPTIONS = [
  { value: 1, label: "Very Low", color: "#DC2626" },
  { value: 2, label: "Low", color: "#F97316" },
  { value: 3, label: "Neutral", color: "#F59E0B" },
  { value: 4, label: "Good", color: "#22C55E" },
  { value: 5, label: "Great", color: "#16A34A" },
];

export const PRIVATE_MOOD_OPTIONS = [
  {
    value: 1,
    label: "Level 1",
    color: "#cad6f0",
    gradient: ["#b048fa", "#1f2635d1"],
  },
  {
    value: 2,
    label: "Level 2",
    color: "#f8c1e9",
    gradient: ["#d317ecc2", "#33152bd6"],
  },
  {
    value: 3,
    label: "Level 3",
    color: "#efe5bb",
    gradient: ["#ff0b8d", "#33152bd6"],
  },
  {
    value: 4,
    label: "Level 4",
    color: "#e592b7",
    gradient: ["#fa2b5b", "#33152bd6"],
  },
  {
    value: 5,
    label: "Level 5",
    color: "#f48b6d",
    gradient: ["#ea1414", "#33152bd6"],
  },
];

export function getMoodOptions(isPrivateMode = false) {
  return isPrivateMode ? PRIVATE_MOOD_OPTIONS : MOOD_OPTIONS;
}

export function getMoodMeta(value, options = {}) {
  const list = getMoodOptions(Boolean(options?.isPrivateMode));
  return list.find((m) => m.value === value) || list[2];
}
