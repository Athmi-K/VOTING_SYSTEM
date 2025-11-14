// backend/db.js
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: 'localhost',
  database: 'voting_system',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

// Export the pool so we can get a client from it
module.exports = pool;