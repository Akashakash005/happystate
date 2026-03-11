# HappyState Backend

This backend is intended for private Grok requests from the mobile app.

## Deploy

1. Deploy the `backend/` folder to Vercel.
2. Add environment variable:
   - `PUTER_AUTH_TOKEN`
3. Expose endpoint:
   - `/api/grok-chat`

## Request body

```json
{
  "messages": [
    { "content": "Hello" }
  ],
  "model": "grok-4-fast"
}
```

## Response body

```json
{
  "text": "..."
}
```
