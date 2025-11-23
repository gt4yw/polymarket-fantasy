const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

// JSON file path for storing bets
const BETS_FILE = path.join(__dirname, "bets.json");

// Set up EJS templating
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Player list (from Python file)
const players = ["Grant", "JB", "Connor", "David", "Bill", "Matt"];

// Helper function to read bets from JSON file
function readBets() {
  try {
    if (fs.existsSync(BETS_FILE)) {
      const data = fs.readFileSync(BETS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading bets file:", error);
  }
  return [];
}

// Helper function to write bets to JSON file
function writeBets(bets) {
  try {
    fs.writeFileSync(BETS_FILE, JSON.stringify(bets, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing bets file:", error);
    throw error;
  }
}

// Helper function to get current odds (simple calculation based on bets)
function getCurrentOdds() {
  const bets = readBets();
  const odds = {};
  
  // Calculate total shares
  const total = bets.reduce((sum, bet) => sum + bet.shares, 0);

  players.forEach((player) => {
    // Calculate total shares for this player
    const playerTotal = bets
      .filter((bet) => bet.player === player)
      .reduce((sum, bet) => sum + bet.shares, 0);
    // Simple odds: percentage of total shares
    odds[player] = total > 0 ? ((playerTotal / total) * 100).toFixed(2) : "0.00";
  });

  return odds;
}

// GET route for home page
app.get("/", (req, res) => {
  const odds = getCurrentOdds();
  res.render("index", { players, odds, query: req.query });
});

// POST route for form submission
app.post("/submit-bet", (req, res) => {
  const { username, player, shares } = req.body;

  // Validate input
  if (!username || !player || !shares) {
    return res.redirect("/?error=missing_fields");
  }

  const sharesNum = parseInt(shares);
  if (isNaN(sharesNum) || sharesNum < 1 || sharesNum > 100) {
    return res.redirect("/?error=invalid_shares");
  }

  if (!players.includes(player)) {
    return res.redirect("/?error=invalid_player");
  }

  // Read existing bets
  const bets = readBets();
  
  // Create new bet object
  const newBet = {
    id: bets.length > 0 ? Math.max(...bets.map(b => b.id)) + 1 : 1,
    username: username,
    player: player,
    shares: sharesNum,
    created_at: new Date().toISOString()
  };
  
  // Add new bet and write to file
  bets.push(newBet);
  writeBets(bets);

  // Redirect to home page to refresh
  res.redirect("/");
});

const PORT = 3000;
app.listen(PORT, (error) => {
  // This is important!
  // Without this, any startup errors will silently fail
  // instead of giving you a helpful error message.
  if (error) {
    throw error;
  }
  console.log(`My first Express app - listening on port ${PORT}!`);
});
