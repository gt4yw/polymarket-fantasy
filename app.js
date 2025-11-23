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

// Helper function to validate username
function isValidUsername(username) {
  const result = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
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
  
  console.log("API /api/user-bets called with username:", username);
  
  if (!username) {
    return res.json({ error: "Username is required" });
  }
  
  // Validate username exists
  if (!isValidUsername(username)) {
    return res.json({ error: "Invalid username" });
  }
  
  // Get all bets for this username
  const bets = db.prepare(`
    SELECT id, username, player, shares, cost, created_at
    FROM bets
    WHERE username = ?
    ORDER BY created_at DESC
  `).all(username);
  
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

  // Validate input
  if (!username || !player || !shares) {
    return res.redirect("/?error=missing_fields");
  }

  // Validate username
  if (!isValidUsername(username)) {
    return res.redirect("/?error=invalid_username");
  }

  const sharesNum = parseInt(shares);
  if (isNaN(sharesNum) || sharesNum < 1 || sharesNum > 100) {
    return res.redirect("/?error=invalid_shares");
  }

  const players = getPlayers();
  if (!players.includes(player)) {
    return res.redirect("/?error=invalid_player");
  }

  // Get current market quantities
  const quantities = getMarketQuantities();
  
  // Calculate LMSR cost for this trade
  const tradeCost = calculateTradeCost(quantities, player, sharesNum);
  
  // Insert bet into database
  const insertBet = db.prepare(`
    INSERT INTO bets (username, player, shares, cost) 
    VALUES (?, ?, ?, ?)
  `);
  insertBet.run(username, player, sharesNum, tradeCost);

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
