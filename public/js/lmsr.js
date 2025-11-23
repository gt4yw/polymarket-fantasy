// LMSR (Logarithmic Market Scoring Rule) calculations for client-side

// LMSR constant (must match server-side)
const B = 50;

// Players list (must match server-side)
const PLAYERS = ['Grant', 'JB', 'Connor', 'David', 'Bill', 'Matt'];

// Market state (quantities per player)
let marketQuantities = {};

// Fetch current market state from server
async function fetchMarketState() {
  try {
    const response = await fetch('/api/market-state');
    const data = await response.json();
    marketQuantities = data.quantities;
    return data;
  } catch (error) {
    console.error('Error fetching market state:', error);
    // Initialize with zeros if fetch fails
    PLAYERS.forEach(player => {
      marketQuantities[player] = 0;
    });
    return { quantities: marketQuantities, players: PLAYERS, b: B };
  }
}

// LMSR cost calculation: cost = b * ln(sum(e^(q_j/b) for all j))
function calculateLMSRCost(quantities) {
  let sumExp = 0;
  
  PLAYERS.forEach((player) => {
    const q = quantities[player] || 0;
    sumExp += Math.exp(q / B);
  });
  
  return B * Math.log(sumExp);
}

// Calculate cost of a trade using LMSR
function calculateTradeCost(player, shares) {
  if (!player || !shares || shares <= 0) {
    return 0;
  }
  
  // Validate player
  if (!PLAYERS.includes(player)) {
    return 0;
  }
  
  // Calculate cost before trade
  const costBefore = calculateLMSRCost(marketQuantities);
  
  // Calculate cost after trade
  const quantitiesAfter = { ...marketQuantities };
  quantitiesAfter[player] = (quantitiesAfter[player] || 0) + parseInt(shares);
  const costAfter = calculateLMSRCost(quantitiesAfter);
  
  // Trade cost is the difference
  return costAfter - costBefore;
}

// Global function to trigger cost recalculation after market state loads
let onMarketStateReady = null;

// Initialize market state when page loads
fetchMarketState().then(() => {
  // Trigger cost recalculation if handler is set
  if (onMarketStateReady) {
    onMarketStateReady();
  }
});

// Export function to set callback for when market state is ready
window.setMarketStateReadyCallback = function(callback) {
  onMarketStateReady = callback;
  // If market state is already loaded, call immediately
  if (Object.keys(marketQuantities).length > 0) {
    callback();
  }
};

