const Database = require("better-sqlite3");
const path = require("path");

// Database file path
const DB_PATH = path.join(__dirname, "database.db");

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playerName TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    player TEXT NOT NULL,
    shares INTEGER NOT NULL,
    cost REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Populate users table (only if empty)
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get();
if (userCount.count === 0) {
  const insertUser = db.prepare("INSERT INTO users (username, name) VALUES (?, ?)");
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
  
  const insertManyUsers = db.transaction((users) => {
    for (const [username, name] of users) {
      insertUser.run(username, name);
    }
  });
  
  insertManyUsers(users);
}

// Populate players table (only if empty)
const playerCount = db.prepare("SELECT COUNT(*) as count FROM players").get();
if (playerCount.count === 0) {
  const insertPlayer = db.prepare("INSERT INTO players (playerName) VALUES (?)");
  const players = ["Grant", "JBrat", "Connor", "David", "Bill", "Matt"];
  
  const insertManyPlayers = db.transaction((players) => {
    for (const playerName of players) {
      insertPlayer.run(playerName);
    }
  });
  
  insertManyPlayers(players);
}

// Export database connection
module.exports = db;

