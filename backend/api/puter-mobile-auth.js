export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const rawReturnUrl = String(req.query?.returnUrl || "").trim();
  const returnUrl = rawReturnUrl || "happystateapp://puter-auth";

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>HappyState Puter Login</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #351018 0%, #08080a 60%);
        color: #ffe8ed;
        font-family: Arial, sans-serif;
      }
      .card {
        width: min(92vw, 380px);
        border-radius: 24px;
        border: 1px solid rgba(255, 72, 106, 0.22);
        background: rgba(16, 16, 20, 0.94);
        padding: 28px 24px;
        box-sizing: border-box;
      }
      h1 {
        margin: 0;
        color: #ff3359;
        font-size: 30px;
      }
      p {
        margin: 14px 0 0;
        color: #efb7c1;
        line-height: 1.6;
      }
      button {
        width: 100%;
        margin-top: 20px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #ff2e56, #d41134);
        color: white;
        font-size: 15px;
        font-weight: 700;
        padding: 14px 16px;
      }
      .status {
        margin-top: 14px;
        min-height: 22px;
        color: #ffb7c2;
        font-size: 13px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Connect Puter</h1>
      <p>Sign in here. Once Puter finishes, this page sends you back into HappyState mobile private mode.</p>
      <button id="sign-in">Sign in with Puter</button>
      <div class="status" id="status"></div>
    </div>

    <script src="https://js.puter.com/v2/"></script>
    <script>
      const returnUrl = ${JSON.stringify(returnUrl)};
      const statusNode = document.getElementById("status");
      const setStatus = (text) => {
        statusNode.textContent = text || "";
      };

      document.getElementById("sign-in").addEventListener("click", async () => {
        try {
          setStatus("Opening Puter sign in...");
          await puter.auth.signIn();
          const token = String(puter.authToken || "").trim();
          if (!token) {
            throw new Error("Puter sign in finished without a token.");
          }

          const redirect = new URL(returnUrl);
          redirect.searchParams.set("status", "success");
          redirect.searchParams.set("token", token);
          window.location.href = redirect.toString();
        } catch (error) {
          const redirect = new URL(returnUrl);
          redirect.searchParams.set("status", "error");
          redirect.searchParams.set(
            "message",
            error?.message || "Puter sign in failed."
          );
          window.location.href = redirect.toString();
        }
      });
    </script>
  </body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
