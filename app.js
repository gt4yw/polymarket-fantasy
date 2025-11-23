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

// LMSR constant (from Python file)
const B = 50;

// Helper function to get current market quantities (outstanding shares per player)
function getMarketQuantities() {
  const bets = readBets();
  const quantities = {};
  
  // Initialize all players with 0 shares
  players.forEach((player) => {
    quantities[player] = 0;
  });
  
  // Sum up all shares for each player
  bets.forEach((bet) => {
    if (quantities.hasOwnProperty(bet.player)) {
      quantities[bet.player] += bet.shares;
    }
  });
  
  return quantities;
}

// LMSR price calculation: price_i = e^(q_i/b) / sum(e^(q_j/b) for all j)
function calculateLMSRPrices(quantities) {
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

// Helper function to get current odds using LMSR
function getCurrentOdds() {
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
  const odds = getCurrentOdds();
  const quantities = getMarketQuantities();
  res.render("index", { players, odds, quantities, query: req.query });
});

// API endpoint to get current market state (quantities)
app.get("/api/market-state", (req, res) => {
  const quantities = getMarketQuantities();
  res.json({ quantities, players, b: B });
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
  
  // Get current market quantities
  const quantities = getMarketQuantities();
  
  // Calculate LMSR cost for this trade
  const tradeCost = calculateTradeCost(quantities, player, sharesNum);
  
  // Create new bet object
  const newBet = {
    id: bets.length > 0 ? Math.max(...bets.map(b => b.id)) + 1 : 1,
    username: username,
    player: player,
    shares: sharesNum,
    cost: tradeCost,
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
