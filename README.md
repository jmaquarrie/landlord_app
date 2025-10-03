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

By default, saved scenarios live in the browser's `localStorage`. They are automatically restored when the app reloads on the same device.

Set a `VITE_SCENARIO_API_URL` environment variable to synchronise scenarios with a backend service. When provided, the app will:

- `GET <VITE_SCENARIO_API_URL>/scenarios` on load to hydrate the UI.
- `PUT <VITE_SCENARIO_API_URL>/scenarios` with the full array of scenarios whenever you add, rename, or delete a save.

The expected JSON shape is an array of objects in the form:

```json
[
  {
    "id": "1707249960000-ab12cd",
    "name": "Manchester duplex",
    "savedAt": "2024-10-16T14:52:00.123Z",
    "data": {
      "propertyAddress": "123 Example Street, Manchester",
      "propertyUrl": "https://example.com/listing/123",
      "purchasePrice": 250000,
      "depositPct": 0.25
      // ...rest of the input model
    }
  }
]
```

### Sample Node backend

You can create a lightweight Express server to satisfy the API contract:

```js
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

let scenarios = [];

app.get('/scenarios', (req, res) => {
  res.json(scenarios);
});

app.put('/scenarios', (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Expected an array of scenarios' });
  }
  scenarios = req.body;
  res.json({ ok: true, count: scenarios.length });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Scenario API listening on ${port}`));
```

Deploy the server (for example on Render, Railway, or Vercel serverless functions) and expose its base URL via `VITE_SCENARIO_API_URL`. With that in place, your saved scenarios stay in sync across devices and networks.

## AI investment assistant

The in-app chatbot can call Google&#39;s Gemini API directly. Provide your API key at build time so the assistant can respond to questions about the current scenario:

```bash
export VITE_GOOGLE_API_KEY="your-google-api-key"
# Optional: override the default model (defaults to gemini-1.5-flash)
export VITE_GOOGLE_MODEL="gemini-1.5-pro"
```

With these variables in place the `Ask assistant` panel will stream questions to `https://generativelanguage.googleapis.com`. If the API returns **404 Not Found**, it usually means your key cannot access the requested model—pick another identifier from Google’s [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) and set `VITE_GOOGLE_MODEL` accordingly. If you prefer to proxy requests through your own service, you can continue to supply `VITE_CHAT_API_URL`; the app will fall back to the proxy whenever a Google API key is not available.
