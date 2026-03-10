function tryParseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function extractRetrySeconds(message = "", details = []) {
  const retryInfo = Array.isArray(details)
    ? details.find((item) => item?.["@type"]?.includes("RetryInfo"))
    : null;

  const retryDelay = String(retryInfo?.retryDelay || "");
  const retryDelayMatch = retryDelay.match(/(\d+)/);
  if (retryDelayMatch) {
    return Number(retryDelayMatch[1]);
  }

  const messageMatch = String(message).match(/retry in\s+([\d.]+)s/i);
  if (messageMatch) {
    return Math.ceil(Number(messageMatch[1]));
  }

  return null;
}

export function getAiQuotaErrorDetails(error) {
  const rawMessage = String(error?.message || "").trim();
  const parsed = tryParseJson(rawMessage);
  const payload = parsed?.error || parsed || null;
  const message = String(payload?.message || rawMessage);
  const status = String(payload?.status || "");
  const code = Number(payload?.code || error?.code || 0);

  const looksLikeQuota =
    code === 429 ||
    status === "RESOURCE_EXHAUSTED" ||
    /quota exceeded|rate limit|resource_exhausted|retry in/i.test(message);

  if (!looksLikeQuota) {
    return {
      isQuotaError: false,
      retrySeconds: null,
      message: "",
    };
  }

  const retrySeconds = extractRetrySeconds(message, payload?.details);
  const retryText = retrySeconds
    ? `Try again in about ${retrySeconds} seconds.`
    : "Try again after some time.";

  return {
    isQuotaError: true,
    retrySeconds,
    message: `The AI is temporarily busy and the request limit has been hit. ${retryText}`,
  };
}
