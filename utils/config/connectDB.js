// utils/config/connectDB.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for DigitalOcean PostgreSQL
  }
}); 

pool.connect()
  .then(() => console.log('✅ PostgreSQL connected successfully'))
  .catch((err) => console.error('❌ PostgreSQL connection error:', err));

module.exports = pool;
