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
async function getPlayers() {
  const result = await db.query("SELECT playername FROM players ORDER BY playername");
  return result.rows.map(row => row.playername);
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
async function isValidUsername(username) {
  const sanitized = sanitizeUsername(username);
  if (!sanitized) {
    return false;
  }
  const result = await db.query("SELECT id FROM users WHERE username = $1", [sanitized]);
  return result.rows.length > 0;
}

// Helper function to get current market quantities (outstanding shares per player)
async function getMarketQuantities() {
  const players = await getPlayers();
  const quantities = {};
  
  // Initialize all players with 0 shares
  players.forEach((player) => {
    quantities[player] = 0;
  });
  
  // Sum up all shares for each player from database
  const result = await db.query(`
    SELECT player, SUM(shares) as total 
    FROM bets 
    GROUP BY player
  `);
  
  result.rows.forEach((row) => {
    if (quantities.hasOwnProperty(row.player)) {
      quantities[row.player] = parseInt(row.total) || 0;
    }
  });
  
  return quantities;
}

// LMSR price calculation: price_i = e^(q_i/b) / sum(e^(q_j/b) for all j)
async function calculateLMSRPrices(quantities) {
  const players = await getPlayers();
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
async function calculateLMSRCost(quantities) {
  const players = await getPlayers();
  let sumExp = 0;
  
  players.forEach((player) => {
    const q = quantities[player] || 0;
    sumExp += Math.exp(q / B);
  });
  
  return B * Math.log(sumExp);
}

// Calculate cost of a trade using LMSR
async function calculateTradeCost(quantities, player, shares) {
  // Calculate cost before trade
  const costBefore = await calculateLMSRCost(quantities);
  
  // Calculate cost after trade
  const quantitiesAfter = { ...quantities };
  quantitiesAfter[player] = (quantitiesAfter[player] || 0) + shares;
  const costAfter = await calculateLMSRCost(quantitiesAfter);
  
  // Trade cost is the difference
  return costAfter - costBefore;
}


// Helper function to get current odds using LMSR
async function getCurrentOdds() {
  const players = await getPlayers();
  const quantities = await getMarketQuantities();
  const prices = await calculateLMSRPrices(quantities);
  const odds = {};
  
  // Convert prices to percentages
  players.forEach((player) => {
    odds[player] = (prices[player] * 100).toFixed(2);
  });

  return odds;
}

// GET route for home page
app.get("/", async (req, res) => {
  try {
    const players = await getPlayers();
    const odds = await getCurrentOdds();
    const quantities = await getMarketQuantities();
    res.render("index", { players, odds, quantities, query: req.query });
  } catch (error) {
    console.error("Error loading home page:", error);
    res.status(500).send("Internal server error");
  }
});

// API endpoint to get current market state (quantities)
app.get("/api/market-state", async (req, res) => {
  try {
    const players = await getPlayers();
    const quantities = await getMarketQuantities();
    res.json({ quantities, players, b: B });
  } catch (error) {
    console.error("Error getting market state:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API endpoint to get bets by username
app.get("/api/user-bets", async (req, res) => {
  try {
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
    const isValid = await isValidUsername(sanitizedUsername);
    if (!isValid) {
      return res.json({ error: "Invalid username" });
    }
    
    // Get all bets for this username (using parameterized query - safe from SQL injection)
    const betsResult = await db.query(`
      SELECT id, username, player, shares, cost, created_at
      FROM bets
      WHERE username = $1
      ORDER BY created_at DESC
    `, [sanitizedUsername]);
    
    const bets = betsResult.rows;
    
    // Get players list
    const players = await getPlayers();
    
    // Initialize player totals
    const playerTotals = {};
    players.forEach(player => {
      playerTotals[player] = 0;
    });
    
    // Calculate totals per player and overall
    const totals = bets.reduce((acc, bet) => {
      acc.totalShares += parseInt(bet.shares) || 0;
      acc.totalCost += parseFloat(bet.cost) || 0;
      
      // Track totals per player
      if (playerTotals.hasOwnProperty(bet.player)) {
        playerTotals[bet.player] += parseInt(bet.shares) || 0;
      }
      
      return acc;
    }, { totalShares: 0, totalCost: 0 });
    
    totals.playerTotals = playerTotals;
    
    res.json({ bets, totals, players });
  } catch (error) {
    console.error("Error getting user bets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST route for form submission
app.post("/submit-bet", async (req, res) => {
  try {
    const { username, player, shares } = req.body;

    // Validate input exists
    if (!username || !player || !shares) {
      return res.redirect("/?error=missing_fields");
    }

    // Sanitize and validate username
    const sanitizedUsername = sanitizeUsername(username);
    if (!sanitizedUsername) {
      return res.redirect("/?error=invalid_username");
    }
    
    const isValid = await isValidUsername(sanitizedUsername);
    if (!isValid) {
      return res.redirect("/?error=invalid_username");
    }

    // Validate and sanitize player (must be from whitelist)
    const players = await getPlayers();
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
    const quantities = await getMarketQuantities();
    
    // Calculate LMSR cost for this trade
    const tradeCost = await calculateTradeCost(quantities, sanitizedPlayer, sharesNum);
    
    // Insert bet into database (using parameterized query - safe from SQL injection)
    await db.query(`
      INSERT INTO bets (username, player, shares, cost) 
      VALUES ($1, $2, $3, $4)
    `, [sanitizedUsername, sanitizedPlayer, sharesNum, tradeCost]);

    // Redirect to home page to refresh
    res.redirect("/");
  } catch (error) {
    console.error("Error submitting bet:", error);
    res.redirect("/?error=server_error");
  }
});

// Wait for database initialization before starting server
db.initializePromise.then(() => {
  console.log("Database ready, starting server...");
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, (error) => {
    // This is important!
    // Without this, any startup errors will silently fail
    // instead of giving you a helpful error message.
    if (error) {
      throw error;
    }
    console.log(`My first Express app - listening on port ${PORT}!`);
  });
}).catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
