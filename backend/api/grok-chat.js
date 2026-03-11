import cors from "cors";

const PUTER_API_ORIGIN = "https://api.puter.com";
const DEFAULT_MODEL = "grok-4-fast";
const corsMiddleware = cors({
  origin: true,
  methods: ["POST", "OPTIONS"],
});

function runMiddleware(req, res, middleware) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

async function consumeNdjsonStream(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return (await response.text()).trim();
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let combined = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed);
      if (parsed?.text) combined += parsed.text;
      if (parsed?.error) {
        throw new Error(parsed.error.message || "Puter chat request failed.");
      }
    }
  }

  if (buffer.trim()) {
    const parsed = JSON.parse(buffer.trim());
    if (parsed?.text) combined += parsed.text;
    if (parsed?.error) {
      throw new Error(parsed.error.message || "Puter chat request failed.");
    }
  }

  return combined.trim();
}

export default async function handler(req, res) {
  await runMiddleware(req, res, corsMiddleware);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authToken = String(process.env.PUTER_AUTH_TOKEN || "").trim();
  if (!authToken) {
    res.status(500).json({ error: "Missing PUTER_AUTH_TOKEN on backend." });
    return;
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const model = String(body.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

    if (!messages.length) {
      res.status(400).json({ error: "messages array is required." });
      return;
    }

    const response = await fetch(`${PUTER_API_ORIGIN}/drivers/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interface: "puter-chat-completion",
        driver: "ai-chat",
        test_mode: false,
        method: "complete",
        args: {
          messages,
          model,
          stream: true,
        },
        auth_token: authToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({
        error: errorText || "Puter drivers/call request failed.",
      });
      return;
    }

    const text = await consumeNdjsonStream(response);
    res.status(200).json({ text });
  } catch (error) {
    res.status(500).json({
      error: error?.message || "Backend grok-chat request failed.",
    });
  }
}
