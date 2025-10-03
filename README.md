# Property Investment QuickCheck

A Vite + React single-page application for reviewing the financial performance of a UK buy-to-let property investment. The app models cash needs, year-one operations, leverage metrics, and a comparison to investing in an index fund.

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL to interact with the calculator.

To build a production bundle:

```bash
npm run build
```

> **Note:** The default styling relies on Tailwind CSS, which is compiled during the build step.

## Scenario persistence

Saved scenarios are stored locally in the browser by default. This keeps the tool completely client-side—every save lives in `localStorage` on the machine where it was created.

### Connecting an external scenario service

If you need to sync scenarios between devices, point the app at your own HTTPS API by setting the `VITE_SCENARIO_API_URL` environment variable (for example `https://api.yourdomain.example/forecast`). When this variable is present the UI surfaces sign-in controls and will attempt to authenticate before reading or writing scenarios.

The frontend expects a simple JSON REST interface:

| Method | Path                 | Description                                 |
| ------ | -------------------- | ------------------------------------------- |
| GET    | `/scenarios`         | Returns an array of saved scenario records  |
| POST   | `/scenarios`         | Creates a new scenario from the request body |
| PUT    | `/scenarios/:id`     | Replaces the full scenario at `:id`         |
| PATCH  | `/scenarios/:id`     | Updates partial fields (for example `name`) |
| DELETE | `/scenarios/:id`     | Deletes the scenario at `:id`               |

Each record should round-trip the JSON payload that the app sends. A typical scenario includes the core form inputs, preview state (whether the property page iframe is active), and the currently selected cash-flow table columns:

```json
{
  "id": "uuid-or-numeric-id",
  "name": "My property",
  "createdAt": "2024-05-16T12:34:56.000Z",
  "savedAt": "2024-05-16T12:34:56.000Z",
  "data": { /* calculator inputs and derived fields */ },
  "preview": { "active": true },
  "cashflowColumns": ["propertyValue", "indexFundValue", "reinvestFund", "cumulativeAfterTax", "cumulativeTax"]
}
```

Authentication is up to you—Basic auth, API keys, or session cookies all work so long as the browser can attach the credentials to every request (the app exposes username/password inputs when the server returns `401 Unauthorized`).

If the API URL is unreachable or returns `404 Not Found`, the app falls back to local-only saves and shows a retry button. Remove `VITE_SCENARIO_API_URL` to stay in offline mode permanently.

## AI investment assistant

The in-app chatbot can call Google&#39;s Gemini API directly. Provide your API key at build time so the assistant can respond to questions about the current scenario:

```bash
export VITE_GOOGLE_API_KEY="your-google-api-key"
# Optional: override the default model (defaults to gemini-flash-latest)
export VITE_GOOGLE_MODEL="gemini-1.5-pro"
```

With these variables in place the `Ask assistant` panel will stream questions to `https://generativelanguage.googleapis.com`. If the API returns **404 Not Found**, it usually means your key cannot access the requested model—pick another identifier from Google’s [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) and set `VITE_GOOGLE_MODEL` accordingly. If you prefer to proxy requests through your own service, you can continue to supply `VITE_CHAT_API_URL`; the app will fall back to the proxy whenever a Google API key is not available.
