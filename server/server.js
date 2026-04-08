const express = require('express');
const sql = require('mssql');

const app = express();
const PORT = 3001;

// SQL Server connection config (shared base)
const dbConfig = {
  server: '192.168.1.100',
  user: 'quas',
  password: 'bonnie',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// One dedicated ConnectionPool per database (not the global sql.connect)
const pools = {};

async function getPool(database = 'Sensor') {
  if (!pools[database]) {
    pools[database] = new sql.ConnectionPool({ ...dbConfig, database });
    await pools[database].connect();
  }
  return pools[database];
}

// CORS — allow dashboard to call from any origin on local network
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// ── Discovery: list databases ──
app.get('/api/databases', async (req, res) => {
  try {
    const pool = await getPool('master');
    const result = await pool.request().query(
      "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name"
    );
    res.json(result.recordset.map(r => r.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Discovery: list tables in a database ──
app.get('/api/:database/tables', async (req, res) => {
  try {
    const pool = await getPool(req.params.database);
    const result = await pool.request().query(
      "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME"
    );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Discovery: list columns for a table ──
app.get('/api/:database/tables/:table/columns', async (req, res) => {
  try {
    const pool = await getPool(req.params.database);
    const result = await pool.request()
      .input('table', sql.VarChar, req.params.table)
      .query(
        "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @table ORDER BY ORDINAL_POSITION"
      );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Discovery: preview rows from a table ──
app.get('/api/:database/tables/:table/preview', async (req, res) => {
  try {
    const pool = await getPool(req.params.database);
    const tables = await pool.request()
      .input('table', sql.VarChar, req.params.table)
      .query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @table");
    if (tables.recordset.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }
    const safeName = tables.recordset[0].TABLE_NAME;
    const result = await pool.request().query(`SELECT TOP 20 * FROM [${safeName}] ORDER BY 1 DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// ── Dashboard API endpoints ──
// ══════════════════════════════════════════════

// ── Temperature history — hourly averages ──
// ?sensorId=231&hours=24
app.get('/api/history/temperature', async (req, res) => {
  try {
    const pool = await getPool('Sensor');
    const hours = Math.min(parseInt(req.query.hours) || 24, 8760);
    const sensorId = req.query.sensorId ? parseInt(req.query.sensorId) : null;

    const request = pool.request().input('hours', sql.Int, hours);

    if (sensorId) {
      request.input('sensorId', sql.Int, sensorId);
      const result = await request.query(`
        SELECT DATEADD(HOUR, DATEDIFF(HOUR, 0, datDate), 0) AS datHour,
               AVG(dblTemp) AS avgTemp,
               AVG(CAST(intHumidity AS FLOAT)) AS avgHumidity
        FROM tblTemp
        WHERE intSensor = @sensorId
          AND datDate >= DATEADD(HOUR, -@hours, GETDATE())
        GROUP BY DATEADD(HOUR, DATEDIFF(HOUR, 0, datDate), 0)
        ORDER BY 1`);
      res.json(result.recordset);
    } else {
      res.status(400).json({ error: 'sensorId is required' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Temperature history — daily averages ──
// ?sensorId=231&days=14
app.get('/api/history/temperature/daily', async (req, res) => {
  try {
    const pool = await getPool('Sensor');
    const days = Math.min(parseInt(req.query.days) || 14, 365);
    const sensorId = parseInt(req.query.sensorId);
    if (!sensorId) return res.status(400).json({ error: 'sensorId is required' });

    const result = await pool.request()
      .input('days', sql.Int, days)
      .input('sensorId', sql.Int, sensorId)
      .query(`
        SELECT CAST(datDate AS DATE) AS datDay,
               AVG(dblTemp) AS avgTemp
        FROM tblTemp
        WHERE intSensor = @sensorId
          AND datDate >= DATEADD(DAY, -@days, GETDATE())
        GROUP BY CAST(datDate AS DATE)
        ORDER BY 1`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── All sensor names ──
app.get('/api/sensors', async (req, res) => {
  try {
    const pool = await getPool('Sensor');
    const result = await pool.request().query('SELECT intSensorID, strSensorName FROM tblTempName ORDER BY strSensorName');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Power production history (solar, battery, grid, house) ──
// ?hours=24 (default 24h), returns data averaged per minute to keep response size reasonable
app.get('/api/history/power', async (req, res) => {
  try {
    const pool = await getPool('Sensor');
    const hours = Math.min(parseInt(req.query.hours) || 24, 8760);

    // Average per hour
    const result = await pool.request()
      .input('hours', sql.Int, hours)
      .query(`
        SELECT
          DATEADD(HOUR, DATEDIFF(HOUR, 0, datMeasureDate), 0) AS datDate,
          AVG(dblBatteryChargePercentage) AS batteryPct,
          AVG(dblBatteryWatt) AS batteryW,
          AVG(dblProductionWatt) AS productionW,
          AVG(dblGridWatt) AS gridW,
          AVG(dblHouseWatt) AS houseW
        FROM tblPowerProduction
        WHERE datMeasureDate >= DATEADD(HOUR, -@hours, GETDATE())
        GROUP BY DATEADD(HOUR, DATEDIFF(HOUR, 0, datMeasureDate), 0)
        ORDER BY 1`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Hourly power consumption history ──
// ?hours=168 (default 7 days), ?sensor=HouseTotal
app.get('/api/history/consumption', async (req, res) => {
  try {
    const pool = await getPool('Sensor');
    const hours = Math.min(parseInt(req.query.hours) || 168, 8760);
    const sensor = req.query.sensor || 'HouseTotal';

    const result = await pool.request()
      .input('hours', sql.Int, hours)
      .input('sensor', sql.VarChar, sensor)
      .query(`
        SELECT datStartDate, datEndDate, dblConsumptionkWh, dblCost
        FROM tblPowerConsumption
        WHERE strSensorName = @sensor
          AND datStartDate >= DATEADD(HOUR, -@hours, GETDATE())
        ORDER BY datStartDate`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Weather history ──
// ?hours=168 (default 7 days)
app.get('/api/history/weather', async (req, res) => {
  try {
    const pool = await getPool('Sensor');
    const hours = Math.min(parseInt(req.query.hours) || 168, 8760);

    const result = await pool.request()
      .input('hours', sql.Int, hours)
      .query(`
        SELECT datDateTime, dblTemp - 273.15 AS tempC, dblPressure, dblHumidity,
               strWeather, intClouds, dblWind, dblWindGust, strWindDirection
        FROM tblWeather
        WHERE datDateTime >= DATEADD(HOUR, -@hours, GETDATE())
        ORDER BY datDateTime`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Generic query endpoint (internal/local network use only) ──
app.get('/api/:database/query', async (req, res) => {
  try {
    const query = req.query.sql;
    if (!query) return res.status(400).json({ error: 'Missing ?sql= parameter' });

    const upper = query.toUpperCase().trim();
    if (/^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC)/i.test(upper)) {
      return res.status(403).json({ error: 'Only SELECT queries are allowed' });
    }

    const pool = await getPool(req.params.database);
    const result = await pool.request().query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard API running on http://0.0.0.0:${PORT}`);
});
