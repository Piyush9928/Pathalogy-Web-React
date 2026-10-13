require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.query('SELECT NOW() AS now, current_database() AS db')
  .then((res) => {
    console.log('Connected OK:', res.rows[0]);
    return pool.end();
  })
  .catch((err) => {
    console.error('Connection failed:', err.message);
    process.exit(1);
  });
