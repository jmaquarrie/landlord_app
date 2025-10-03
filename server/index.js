import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';

const DB_HOST = process.env.SCENARIO_DB_HOST || 'sql8.freesqldatabase.com';
const DB_PORT = Number(process.env.SCENARIO_DB_PORT) || 3306;
const DB_NAME = process.env.SCENARIO_DB_NAME || 'sql8801207';
const DB_USER = process.env.SCENARIO_DB_USER || 'sql8801207';
const DB_PASSWORD = process.env.SCENARIO_DB_PASSWORD || 'jeN72vEAWL';
const DB_CONNECTION_LIMIT = Number(process.env.SCENARIO_DB_CONNECTION_LIMIT) || 10;
const SCENARIO_USERNAME = process.env.SCENARIO_USERNAME || 'pi';
const SCENARIO_PASSWORD = process.env.SCENARIO_PASSWORD || 'jmaq2460';
const PORT = Number(process.env.PORT) || 4000;

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
  queueLimit: 0,
});

const ensureSchema = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS scenarios (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      data LONGTEXT NOT NULL,
      preview LONGTEXT NOT NULL,
      cashflow_columns LONGTEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  try {
    await pool.execute(
      'CREATE INDEX idx_scenarios_updated_at ON scenarios (updated_at)'
    );
  } catch (error) {
    if (error?.code !== 'ER_DUP_KEYNAME') {
      throw error;
    }
  }
};

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

const getRowById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM scenarios WHERE id = ?', [id]);
  return rows[0] || null;
};

const respondWithError = (res, status, error, message) => {
  console.error(message, error);
  res.status(status).json({ error: message });
};

try {
  await ensureSchema();
} catch (error) {
  console.error('Failed to initialize database schema', error);
  process.exit(1);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: now() });
});

app.get('/api/scenarios', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM scenarios ORDER BY updated_at DESC'
    );
    res.json(rows.map((row) => rowToScenario(row)));
  } catch (error) {
    respondWithError(res, 500, error, 'Failed to fetch scenarios');
  }
});

app.post('/api/scenarios', async (req, res) => {
  try {
    const name = sanitizeName(req.body?.name);
    const data = sanitizeData(req.body?.data);
    const preview = sanitizePreview(req.body?.preview);
    const cashflowColumns = sanitizeColumns(req.body?.cashflowColumns);
    const id = randomUUID();
    const timestamp = now();
    await pool.execute(
      `INSERT INTO scenarios (id, name, data, preview, cashflow_columns, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        JSON.stringify(data),
        JSON.stringify(preview),
        JSON.stringify(cashflowColumns),
        timestamp,
        timestamp,
      ]
    );
    const row = await getRowById(id);
    if (!row) {
      return respondWithError(
        res,
        500,
        new Error('Created scenario could not be retrieved'),
        'Failed to load created scenario'
      );
    }
    res.status(201).json(rowToScenario(row));
  } catch (error) {
    respondWithError(res, 500, error, 'Failed to create scenario');
  }
});

app.put('/api/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getRowById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    const name = sanitizeName(req.body?.name ?? existing.name);
    const data = sanitizeData(req.body?.data ?? JSON.parse(existing.data));
    const preview = sanitizePreview(
      req.body?.preview ?? JSON.parse(existing.preview)
    );
    const cashflowColumns = sanitizeColumns(
      req.body?.cashflowColumns ?? JSON.parse(existing.cashflow_columns)
    );
    const updatedAt = now();
    await pool.execute(
      `UPDATE scenarios
       SET name = ?,
           data = ?,
           preview = ?,
           cashflow_columns = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        name,
        JSON.stringify(data),
        JSON.stringify(preview),
        JSON.stringify(cashflowColumns),
        updatedAt,
        id,
      ]
    );
    const row = await getRowById(id);
    if (!row) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    res.json(rowToScenario(row));
  } catch (error) {
    respondWithError(res, 500, error, 'Failed to update scenario');
  }
});

app.patch('/api/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getRowById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    const next = {
      name: sanitizeName(req.body?.name ?? existing.name),
      data: sanitizeData(req.body?.data ?? JSON.parse(existing.data)),
      preview: sanitizePreview(
        req.body?.preview ?? JSON.parse(existing.preview)
      ),
      cashflowColumns: sanitizeColumns(
        req.body?.cashflowColumns ?? JSON.parse(existing.cashflow_columns)
      ),
    };
    const updatedAt = now();
    await pool.execute(
      `UPDATE scenarios
       SET name = ?,
           data = ?,
           preview = ?,
           cashflow_columns = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        next.name,
        JSON.stringify(next.data),
        JSON.stringify(next.preview),
        JSON.stringify(next.cashflowColumns),
        updatedAt,
        id,
      ]
    );
    const row = await getRowById(id);
    if (!row) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    res.json(rowToScenario(row));
  } catch (error) {
    respondWithError(res, 500, error, 'Failed to update scenario');
  }
});

app.delete('/api/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM scenarios WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    res.status(204).send();
  } catch (error) {
    respondWithError(res, 500, error, 'Failed to delete scenario');
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Scenario service listening on http://localhost:${PORT}`);
});
