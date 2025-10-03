import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DB_PATH = process.env.SCENARIO_DB_PATH || path.join(__dirname, 'scenarios.db');
const SCENARIO_USERNAME = process.env.SCENARIO_USERNAME || 'pi';
const SCENARIO_PASSWORD = process.env.SCENARIO_PASSWORD || 'jmaq2460';
const PORT = Number(process.env.PORT) || 4000;

const db = new Database(DEFAULT_DB_PATH);
db.pragma('journal_mode = WAL');
db.prepare(`
  CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    preview TEXT NOT NULL,
    cashflow_columns TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

db.prepare(
  'CREATE INDEX IF NOT EXISTS idx_scenarios_updated_at ON scenarios (updated_at DESC)'
).run();

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Property Forecaster"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.slice(6);
  let decoded = '';
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch (error) {
    return res.status(401).json({ error: 'Invalid authorization header' });
  }
  const [username, password] = decoded.split(':');
  if (username !== SCENARIO_USERNAME || password !== SCENARIO_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Property Forecaster"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  next();
};

app.use('/api', requireAuth);

const now = () => new Date().toISOString();

const rowToScenario = (row) => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  savedAt: row.updated_at,
  data: JSON.parse(row.data),
  preview: JSON.parse(row.preview),
  cashflowColumns: JSON.parse(row.cashflow_columns),
});

const sanitizeName = (value) => {
  if (typeof value !== 'string') return 'Scenario';
  const trimmed = value.trim();
  return trimmed === '' ? 'Scenario' : trimmed;
};

const sanitizeData = (value) => {
  if (!value || typeof value !== 'object') return {};
  return value;
};

const sanitizePreview = (value) => {
  if (!value || typeof value !== 'object') return { active: false };
  return { active: Boolean(value.active) };
};

const sanitizeColumns = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: now() });
});

app.get('/api/scenarios', (req, res) => {
  const rows = db.prepare('SELECT * FROM scenarios ORDER BY updated_at DESC').all();
  res.json(rows.map((row) => rowToScenario(row)));
});

app.post('/api/scenarios', (req, res) => {
  const name = sanitizeName(req.body?.name);
  const data = sanitizeData(req.body?.data);
  const preview = sanitizePreview(req.body?.preview);
  const cashflowColumns = sanitizeColumns(req.body?.cashflowColumns);
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO scenarios (id, name, data, preview, cashflow_columns, created_at, updated_at)
     VALUES (@id, @name, @data, @preview, @cashflowColumns, @createdAt, @updatedAt)`
  ).run({
    id,
    name,
    data: JSON.stringify(data),
    preview: JSON.stringify(preview),
    cashflowColumns: JSON.stringify(cashflowColumns),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const row = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id);
  res.status(201).json(rowToScenario(row));
});

app.put('/api/scenarios/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Scenario not found' });
  }
  const name = sanitizeName(req.body?.name ?? existing.name);
  const data = sanitizeData(req.body?.data ?? JSON.parse(existing.data));
  const preview = sanitizePreview(req.body?.preview ?? JSON.parse(existing.preview));
  const cashflowColumns = sanitizeColumns(
    req.body?.cashflowColumns ?? JSON.parse(existing.cashflow_columns)
  );
  const updatedAt = now();
  db.prepare(
    `UPDATE scenarios
     SET name = @name,
         data = @data,
         preview = @preview,
         cashflow_columns = @cashflowColumns,
         updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    id,
    name,
    data: JSON.stringify(data),
    preview: JSON.stringify(preview),
    cashflowColumns: JSON.stringify(cashflowColumns),
    updatedAt,
  });
  const row = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id);
  res.json(rowToScenario(row));
});

app.patch('/api/scenarios/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Scenario not found' });
  }
  const next = {
    name: sanitizeName(req.body?.name ?? existing.name),
    data: sanitizeData(req.body?.data ?? JSON.parse(existing.data)),
    preview: sanitizePreview(req.body?.preview ?? JSON.parse(existing.preview)),
    cashflowColumns: sanitizeColumns(
      req.body?.cashflowColumns ?? JSON.parse(existing.cashflow_columns)
    ),
  };
  const updatedAt = now();
  db.prepare(
    `UPDATE scenarios
     SET name = @name,
         data = @data,
         preview = @preview,
         cashflow_columns = @cashflowColumns,
         updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    id,
    name: next.name,
    data: JSON.stringify(next.data),
    preview: JSON.stringify(next.preview),
    cashflowColumns: JSON.stringify(next.cashflowColumns),
    updatedAt,
  });
  const row = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id);
  res.json(rowToScenario(row));
});

app.delete('/api/scenarios/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM scenarios WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Scenario not found' });
  }
  res.status(204).send();
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Scenario service listening on http://localhost:${PORT}`);
});
