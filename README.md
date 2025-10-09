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

## UK market data & scoring

- Choose a property type in the **Property info** panel to align the analysis with Land Registry averages for detached, semi-detached, terraced, or flats/maisonettes. The selector surfaces the latest national pricing snapshot and long-run CAGR pulled from `Average-prices-Property-Type-2025-07.csv`.
- Under **Rental cashflow** you can keep a manual capital growth assumption or toggle to apply the historical CAGR for the selected property type across 1, 5, 10, or 20-year windows. When enabled, projections ignore the manual field and compound using the chosen data window.
- The composite investment score now blends cap rate strength, DSCR resilience, 20-year market growth, and crime safety (benchmarked against UK averages) alongside the existing return metrics so the grade reflects both performance and location risk.

## Scenario persistence

Saved scenarios are stored locally in the browser by default. To sync them across devices, run the lightweight Express + MySQL service in `server/index.js` and point the frontend at it. Start the backend alongside the Vite dev server in another terminal:

```bash
npm run server
```

The service listens on `http://localhost:4000` by default and exposes the following authenticated endpoints:

| Method | Path                  | Description                            |
| ------ | --------------------- | -------------------------------------- |
| GET    | `/api/scenarios`      | List all saved scenarios (newest first) |
| POST   | `/api/scenarios`      | Create a new scenario                   |
| PUT    | `/api/scenarios/:id`  | Replace an existing scenario            |
| PATCH  | `/api/scenarios/:id`  | Partially update a scenario (e.g. name) |
| DELETE | `/api/scenarios/:id`  | Remove a scenario                       |

All requests require HTTP Basic authentication using the credentials:

- **Username:** `pi`
- **Password:** `jmaq2460`

Expose the backend URL to the frontend by setting `VITE_SCENARIO_API_URL` (for example `http://localhost:4000/api`). When this environment variable is present the React app will automatically attempt to sync, prompting for the credentials above if the backend rejects a request. Scenario payloads include the captured inputs, preview state, and the selected cash-flow columns so that reloading or sharing a scenario restores the full layout.

Environment variables let you tailor the service:

- `PORT` – change the listen port (defaults to `4000`).
- `SCENARIO_DB_HOST`, `SCENARIO_DB_PORT`, `SCENARIO_DB_NAME`, `SCENARIO_DB_USER`, `SCENARIO_DB_PASSWORD` – override the MySQL connection (defaults point at the hosted instance on `sql8.freesqldatabase.com`).
- `SCENARIO_DB_CONNECTION_LIMIT` – tune the size of the MySQL connection pool (defaults to `10`).
- `SCENARIO_USERNAME` / `SCENARIO_PASSWORD` – replace the default login.
- `VITE_SHORT_IO_API_KEY` / `VITE_SHORT_IO_DOMAIN` – optionally enable automatic short.io links when sharing scenarios from the UI.

If you deploy the service elsewhere, update `VITE_SCENARIO_API_URL` to match (for example `https://yourdomain.example/api`). If the variable is unset the app falls back to browser-only storage and hides remote sync prompts.

## AI investment assistant

The in-app chatbot can call Google&#39;s Gemini API directly. Provide your API key at build time so the assistant can respond to questions about the current scenario:

```bash
export VITE_GOOGLE_API_KEY="your-google-api-key"
# Optional: override the default model (defaults to gemini-flash-latest)
export VITE_GOOGLE_MODEL="gemini-1.5-pro"
```

With these variables in place the `Ask assistant` panel will stream questions to `https://generativelanguage.googleapis.com`. If the API returns **404 Not Found**, it usually means your key cannot access the requested model—pick another identifier from Google’s [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) and set `VITE_GOOGLE_MODEL` accordingly. If you prefer to proxy requests through your own service, you can continue to supply `VITE_CHAT_API_URL`; the app will fall back to the proxy whenever a Google API key is not available.
