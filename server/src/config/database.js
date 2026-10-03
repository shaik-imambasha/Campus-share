const { Pool } = require('pg');
const fs = require('fs');

const sslEnabled = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production';
const ssl = sslEnabled
  ? {
      rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false',
      ...(process.env.DB_SSL_CA_FILE
        ? { ca: fs.readFileSync(process.env.DB_SSL_CA_FILE, 'utf8') }
        : {}),
    }
  : false;
const connection = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl,
    };

const pool = new Pool(connection);
pool.on('error', error => console.error('PostgreSQL pool error:', error.message));

async function checkDatabaseConnection() {
  const result = await pool.query('SELECT NOW() AS now');
  return result.rows[0];
}

module.exports = { pool, checkDatabaseConnection };
