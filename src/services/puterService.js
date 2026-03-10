import { Platform } from "react-native";

const PUTER_API_ORIGIN = "https://api.puter.com";
const DEFAULT_MODEL = "grok-4-fast";
const TOKEN_KEY = "happy_state_puter_auth_token";
const USER_KEY = "happy_state_puter_user";
const POPUP_NAME = "HappyStatePuterAuth";

function isBrowserEnv() {
  return Platform.OS === "web" && typeof window !== "undefined";
}

function getStoredToken() {
  if (!isBrowserEnv()) return "";
  try {
    return String(window.sessionStorage.getItem(TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setStoredAuth(token, user) {
  if (!isBrowserEnv()) return;
  try {
    window.sessionStorage.setItem(TOKEN_KEY, String(token || "").trim());
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user || null));
  } catch {
    // Best effort only.
  }
}

function clearStoredAuth() {
  if (!isBrowserEnv()) return;
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(USER_KEY);
  } catch {
    // Best effort only.
  }
}

function buildPuterAuthHtml() {
  const origin = window.location.origin;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Puter Sign In</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b0b0d;
        color: #fff3f5;
        font-family: Arial, sans-serif;
      }
      .card {
        width: min(92vw, 360px);
        background: #151519;
        border: 1px solid #3a0f17;
        border-radius: 18px;
        padding: 24px;
        text-align: center;
        box-sizing: border-box;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 24px;
        color: #ff2a52;
      }
      p {
        margin: 0 0 18px;
        color: #c98692;
        line-height: 1.5;
      }
      button {
        border: 0;
        border-radius: 999px;
        background: #ff2a52;
        color: white;
        font-weight: 700;
        padding: 12px 18px;
        cursor: pointer;
      }
      .status {
        margin-top: 12px;
        font-size: 13px;
        color: #c98692;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Connect Puter</h1>
      <p>Sign in here, then return to HappyState private journal.</p>
      <button id="sign-in">Sign in</button>
      <div class="status" id="status"></div>
    </div>
    <script src="https://js.puter.com/v2/"></script>
    <script>
      const status = document.getElementById('status');
      const setStatus = (text) => { status.textContent = text || ''; };
      document.getElementById('sign-in').addEventListener('click', async () => {
        try {
          setStatus('Opening Puter sign-in...');
          const user = await puter.auth.signIn();
          const token = String(puter.authToken || '').trim();
          if (!token) {
            throw new Error('Puter sign-in finished without an auth token.');
          }
          window.opener?.postMessage(
            { type: 'happy-state-puter-auth', token, user },
            ${JSON.stringify(origin)}
          );
          setStatus('Connected. You can close this window.');
          window.close();
        } catch (error) {
          setStatus(error?.message || JSON.stringify(error));
          window.opener?.postMessage(
            {
              type: 'happy-state-puter-auth-error',
              message: error?.message || 'Puter sign-in failed.',
            },
            ${JSON.stringify(origin)}
          );
        }
      });
    </script>
  </body>
</html>`;
}

export async function isPuterSignedIn() {
  return Boolean(getStoredToken());
}

export async function signInToPuter() {
  if (!isBrowserEnv()) {
    throw new Error("Puter authentication requires web environment.");
  }

  const existingToken = getStoredToken();
  if (existingToken) {
    return existingToken;
  }

  const popup = window.open("", POPUP_NAME, "width=520,height=760");
  if (!popup) {
    throw new Error("Popup blocked. Allow popups and try again.");
  }

  popup.document.open();
  popup.document.write(buildPuterAuthHtml());
  popup.document.close();

  return new Promise((resolve, reject) => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};

      if (data.type === "happy-state-puter-auth") {
        window.removeEventListener("message", handleMessage);
        setStoredAuth(data.token, data.user);
        resolve(String(data.token || "").trim());
      }

      if (data.type === "happy-state-puter-auth-error") {
        window.removeEventListener("message", handleMessage);
        clearStoredAuth();
        reject(new Error(data.message || "Puter sign-in failed."));
      }
    };

    window.addEventListener("message", handleMessage);
  });
}

async function consumeNdjsonStream(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    return text.trim();
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

export async function chatWithPuter(prompt, options = {}) {
  const authToken = getStoredToken() || (await signInToPuter());

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
        messages: [{ content: prompt }],
        model: options.model || DEFAULT_MODEL,
        stream: true,
      },
      auth_token: authToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Puter drivers/call request failed.");
  }

  const text = await consumeNdjsonStream(response);
  if (!text) {
    throw new Error("Puter chat returned an empty response.");
  }
  return text;
}
