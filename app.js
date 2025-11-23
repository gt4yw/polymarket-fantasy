const express = require("express");
const path = require("path");
const db = require("./database");
const app = express();

// Set up EJS templating
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// LMSR constant (from Python file)
const B = 50;

// Helper function to get players from database
function getPlayers() {
  const result = db.prepare("SELECT playerName FROM players ORDER BY playerName").all();
  return result.map(row => row.playerName);
}

// Helper function to sanitize and validate username
function sanitizeUsername(username) {
  if (typeof username !== 'string') {
    return null;
  }
  // Trim whitespace
  const sanitized = username.trim();
  // Limit length (usernames are 12 characters, but allow some buffer)
  if (sanitized.length === 0 || sanitized.length > 50) {
    return null;
  }
  // Only allow alphanumeric characters (matching the 12-char username format)
  if (!/^[a-zA-Z0-9]+$/.test(sanitized)) {
    return null;
  }
  return sanitized;
}

// Helper function to validate username exists in database
function isValidUsername(username) {
  const sanitized = sanitizeUsername(username);
  if (!sanitized) {
    return false;
  }
  const result = db.prepare("SELECT id FROM users WHERE username = ?").get(sanitized);
  return result !== undefined;
}

// Helper function to get current market quantities (outstanding shares per player)
function getMarketQuantities() {
  const players = getPlayers();
  const quantities = {};
  
  // Initialize all players with 0 shares
  players.forEach((player) => {
    quantities[player] = 0;
  });
  
  // Sum up all shares for each player from database
  const result = db.prepare(`
    SELECT player, SUM(shares) as total 
    FROM bets 
    GROUP BY player
  `).all();
  
  result.forEach((row) => {
    if (quantities.hasOwnProperty(row.player)) {
      quantities[row.player] = row.total;
    }
  });
  
  return quantities;
}

// LMSR price calculation: price_i = e^(q_i/b) / sum(e^(q_j/b) for all j)
function calculateLMSRPrices(quantities) {
  const players = getPlayers();
  const prices = {};
  const expValues = {};
  let denominator = 0;
  
  // Calculate exp(q_i/b) for each player
  players.forEach((player) => {
    const q = quantities[player] || 0;
    expValues[player] = Math.exp(q / B);
    denominator += expValues[player];
  });
  
  // Calculate price for each player
  players.forEach((player) => {
    prices[player] = expValues[player] / denominator;
  });
  
  return prices;
}

// LMSR cost calculation: cost = b * ln(sum(e^(q_j/b) for all j))
function calculateLMSRCost(quantities) {
  const players = getPlayers();
  let sumExp = 0;
  
  players.forEach((player) => {
    const q = quantities[player] || 0;
    sumExp += Math.exp(q / B);
  });
  
  return B * Math.log(sumExp);
}

// Calculate cost of a trade using LMSR
function calculateTradeCost(quantities, player, shares) {
  // Calculate cost before trade
  const costBefore = calculateLMSRCost(quantities);
  
  // Calculate cost after trade
  const quantitiesAfter = { ...quantities };
  quantitiesAfter[player] = (quantitiesAfter[player] || 0) + shares;
  const costAfter = calculateLMSRCost(quantitiesAfter);
  
  // Trade cost is the difference
  return costAfter - costBefore;
}


// Helper function to get current odds using LMSR
function getCurrentOdds() {
  const players = getPlayers();
  const quantities = getMarketQuantities();
  const prices = calculateLMSRPrices(quantities);
  const odds = {};
  
  // Convert prices to percentages
  players.forEach((player) => {
    odds[player] = (prices[player] * 100).toFixed(2);
  });

  return odds;
}

// GET route for home page
app.get("/", (req, res) => {
  const players = getPlayers();
  const odds = getCurrentOdds();
  const quantities = getMarketQuantities();
  res.render("index", { players, odds, quantities, query: req.query });
});

// API endpoint to get current market state (quantities)
app.get("/api/market-state", (req, res) => {
  const players = getPlayers();
  const quantities = getMarketQuantities();
  res.json({ quantities, players, b: B });
});

// API endpoint to get bets by username
app.get("/api/user-bets", (req, res) => {
  const { username } = req.query;
  
  if (!username) {
    return res.json({ error: "Username is required" });
  }
  
  // Sanitize and validate username
  const sanitizedUsername = sanitizeUsername(username);
  if (!sanitizedUsername) {
    return res.json({ error: "Invalid username format" });
  }
  
  // Validate username exists in database
  if (!isValidUsername(sanitizedUsername)) {
    return res.json({ error: "Invalid username" });
  }
  
  // Get all bets for this username (using parameterized query - safe from SQL injection)
  const bets = db.prepare(`
    SELECT id, username, player, shares, cost, created_at
    FROM bets
    WHERE username = ?
    ORDER BY created_at DESC
  `).all(sanitizedUsername);
  
  // Get players list
  const players = getPlayers();
  
  // Initialize player totals
  const playerTotals = {};
  players.forEach(player => {
    playerTotals[player] = 0;
  });
  
  // Calculate totals per player and overall
  const totals = bets.reduce((acc, bet) => {
    acc.totalShares += bet.shares || 0;
    acc.totalCost += parseFloat(bet.cost) || 0;
    
    // Track totals per player
    if (playerTotals.hasOwnProperty(bet.player)) {
      playerTotals[bet.player] += bet.shares || 0;
    }
    
    return acc;
  }, { totalShares: 0, totalCost: 0 });
  
  totals.playerTotals = playerTotals;
  
  res.json({ bets, totals, players });
});

// POST route for form submission
app.post("/submit-bet", (req, res) => {
  const { username, player, shares } = req.body;

  // Validate input exists
  if (!username || !player || !shares) {
    return res.redirect("/?error=missing_fields");
  }

  // Sanitize and validate username
  const sanitizedUsername = sanitizeUsername(username);
  if (!sanitizedUsername || !isValidUsername(sanitizedUsername)) {
    return res.redirect("/?error=invalid_username");
  }

  // Validate and sanitize player (must be from whitelist)
  const players = getPlayers();
  const sanitizedPlayer = typeof player === 'string' ? player.trim() : null;
  if (!sanitizedPlayer || !players.includes(sanitizedPlayer)) {
    return res.redirect("/?error=invalid_player");
  }

  // Validate and parse shares (must be integer between 1-100)
  const sharesNum = parseInt(shares, 10);
  if (isNaN(sharesNum) || sharesNum < 1 || sharesNum > 100 || !Number.isInteger(sharesNum)) {
    return res.redirect("/?error=invalid_shares");
  }

  // Get current market quantities
  const quantities = getMarketQuantities();
  
  // Calculate LMSR cost for this trade
  const tradeCost = calculateTradeCost(quantities, player, sharesNum);
  
  // Insert bet into database (using parameterized query - safe from SQL injection)
  const insertBet = db.prepare(`
    INSERT INTO bets (username, player, shares, cost) 
    VALUES (?, ?, ?, ?)
  `);
  insertBet.run(sanitizedUsername, sanitizedPlayer, sharesNum, tradeCost);

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
