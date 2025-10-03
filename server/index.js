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
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        data LONGTEXT NOT NULL,
        preview LONGTEXT NOT NULL,
        cashflow_columns LONGTEXT NOT NULL,
        created_at VARCHAR(32) NOT NULL,
        updated_at VARCHAR(32) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    try {
      await connection.query(
        'CREATE INDEX idx_scenarios_updated_at ON scenarios (updated_at)'
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }
  } finally {
    connection.release();
  }
};

const isMissingTableError = (error) =>
  error?.code === 'ER_NO_SUCH_TABLE' ||
  error?.code === 'ER_BAD_TABLE_ERROR' ||
  error?.errno === 1146;

let schemaPromise = null;
const getSchemaPromise = () => {
  if (!schemaPromise) {
    schemaPromise = ensureSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
};

const runWithSchema = async (operation) => {
  let attemptedRetry = false;
  for (;;) {
    await getSchemaPromise();
    try {
      return await operation();
    } catch (error) {
      if (isMissingTableError(error) && !attemptedRetry) {
        attemptedRetry = true;
        schemaPromise = null;
        continue;
      }
      throw error;
    }
  }
};

const withConnection = async (callback) => {
  const connection = await pool.getConnection();
  try {
    return await callback(connection);
  } finally {
    connection.release();
  }
};

const runInTransaction = async (callback) =>
  runWithSchema(() =>
    withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const result = await callback(connection);
        await connection.commit();
        return result;
      } catch (error) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error('Failed to rollback transaction', rollbackError);
        }
        throw error;
      }
    })
  );

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

const safeParseJson = (value, fallback) => {
  if (typeof value !== 'string' || value === '') {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Unable to parse scenario JSON payload', error);
    return fallback;
  }
};

const rowToScenario = (row) => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  savedAt: row.updated_at,
  data: safeParseJson(row.data, {}),
  preview: safeParseJson(row.preview, { active: false }),
  cashflowColumns: sanitizeColumns(safeParseJson(row.cashflow_columns, [])),
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

const getRowById = async (id) =>
  runWithSchema(() =>
    withConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM scenarios WHERE id = ?',
        [id]
      );
      return rows[0] || null;
    })
  );

const respondWithError = (res, status, error, message) => {
  console.error(message, error);
  res.status(status).json({ error: message });
};

try {
  await getSchemaPromise();
} catch (error) {
  console.error('Failed to initialize database schema', error);
  process.exit(1);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: now() });
});

app.get('/api/scenarios', async (req, res) => {
  try {
    const rows = await runWithSchema(() =>
      withConnection(async (connection) => {
        const [result] = await connection.execute(
          'SELECT * FROM scenarios ORDER BY updated_at DESC'
        );
        return result;
      })
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
    const scenario = await runInTransaction(async (connection) => {
      const [result] = await connection.execute(
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
      if (result.affectedRows !== 1) {
        throw new Error('Scenario insert did not affect any rows');
      }
      const [rows] = await connection.execute(
        'SELECT * FROM scenarios WHERE id = ? LIMIT 1',
        [id]
      );
      if (!rows[0]) {
        throw new Error('Inserted scenario could not be found');
      }
      return rowToScenario(rows[0]);
    });
    res.status(201).json(scenario);
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
    const scenario = await runInTransaction(async (connection) => {
      const [result] = await connection.execute(
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
      if (result.affectedRows === 0) {
        throw new Error('Scenario update did not affect any rows');
      }
      const [rows] = await connection.execute(
        'SELECT * FROM scenarios WHERE id = ? LIMIT 1',
        [id]
      );
      if (!rows[0]) {
        throw new Error('Scenario not found after update');
      }
      return rowToScenario(rows[0]);
    });
    res.json(scenario);
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
    const scenario = await runInTransaction(async (connection) => {
      const [result] = await connection.execute(
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
      if (result.affectedRows === 0) {
        throw new Error('Scenario update did not affect any rows');
      }
      const [rows] = await connection.execute(
        'SELECT * FROM scenarios WHERE id = ? LIMIT 1',
        [id]
      );
      if (!rows[0]) {
        throw new Error('Scenario not found after update');
      }
      return rowToScenario(rows[0]);
    });
    res.json(scenario);
  } catch (error) {
    respondWithError(res, 500, error, 'Failed to update scenario');
  }
});

app.delete('/api/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await runWithSchema(() =>
      withConnection(async (connection) => {
        const [result] = await connection.execute(
          'DELETE FROM scenarios WHERE id = ?',
          [id]
        );
        return result.affectedRows;
      })
    );
    if (deleted === 0) {
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
