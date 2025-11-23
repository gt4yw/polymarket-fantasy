// Load environment variables from .env file (for local development)
require('dotenv').config();

const { Pool } = require("pg");

// Get database URL from environment variable
// Railway provides DATABASE_URL when PostgreSQL service is added
// Also check for alternative names Railway might use
const DATABASE_URL = process.env.DATABASE_URL || 
                     process.env.POSTGRES_URL || 
                     process.env.DATABASE_PRIVATE_URL ||
                     process.env.POSTGRES_PRIVATE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set");
  console.error("Please ensure:");
  console.error("1. A PostgreSQL service is added to your Railway project");
  console.error("2. The PostgreSQL service is linked to your app service");
  console.error("3. Or set DATABASE_URL manually in Railway environment variables");
  console.error("");
  console.error("For local development, set DATABASE_URL in your .env file");
  console.error("Example: DATABASE_URL=postgresql://username:password@localhost:5432/database_name");
  console.error("See .env.example for more details");
  process.exit(1);
}

// Create connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Initialize database tables and data
async function initializeDatabase() {
  console.log("Starting database initialization...");
  const client = await pool.connect();
  
  try {
    console.log("Creating tables...");
    // Create tables with PostgreSQL syntax
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(50) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        playername VARCHAR(50) NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS bets (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        player VARCHAR(50) NOT NULL,
        shares INTEGER NOT NULL,
        cost REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Tables created successfully");

    // Populate users table (only if empty)
    const userCountResult = await client.query("SELECT COUNT(*) as count FROM users");
    const userCount = parseInt(userCountResult.rows[0].count);
    if (userCount === 0) {
      console.log("Populating users table...");
      const users = [
        ["5eDTYGefddTF", "Grant"],
        ["iRwyiTvgCoF9", "Isaac"],
        ["UyaLqg1IGlMt", "Matt"],
        ["6piA0otv6oUl", "Asher"],
        ["Ag2DVjK1eQv1", "David"],
        ["6BTP4Ck7hCsY", "Will"],
        ["Rqts3vdrmZGO", "Jonathan"],
        ["wKAboTGzXi7Y", "Landon"],
        ["cRsEWtC6Mjrx", "Connor"],
        ["6qNnibKfC0rx", "Pedro"],
        ["5Fcoge1L80lK", "Nathan"],
        ["ORqXsR7ASypE", "Brendan"]
      ];
      
      for (const [username, name] of users) {
        await client.query("INSERT INTO users (username, name) VALUES ($1, $2)", [username, name]);
      }
      console.log(`Inserted ${users.length} users`);
    } else {
      console.log(`Users table already has ${userCount} entries, skipping population`);
    }

    // Populate players table (only if empty)
    const playerCountResult = await client.query('SELECT COUNT(*) as count FROM players');
    const playerCount = parseInt(playerCountResult.rows[0].count);
    if (playerCount === 0) {
      console.log("Populating players table...");
      const players = ["Grant", "JBrat", "Connor", "David", "Bill", "Matt"];
      
      for (const playerName of players) {
        await client.query('INSERT INTO players (playername) VALUES ($1)', [playerName]);
      }
      console.log(`Inserted ${players.length} players`);
    } else {
      console.log(`Players table already has ${playerCount} entries, skipping population`);
    }
    
    console.log("Database initialization complete");
  } finally {
    client.release();
  }
}

// Initialize database and export the promise
const initializePromise = initializeDatabase().catch(err => {
  console.error("Error initializing database:", err);
  process.exit(1);
});

// Export pool and initialization promise for use in app.js
module.exports = pool;
module.exports.initializePromise = initializePromise;
