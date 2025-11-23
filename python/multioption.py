# LMSR implementation of the formula for testing
import math 
'''
Computing a stock price 
The current price for a stock (in a market with 2 stocks) using LMSR is calculated with the formula:

price = e^(q1/b) / (e^(q1/b)+e^(q2/b))

In this formula, b is an arbitrary constant, q1 is the number of outstanding shares in the stock for which you're calculating the price, and q2 is the number of outstanding shares in the other stock.

This formula can be extended to markets with more than 2 stocks. For a 3 stock market, the equation would be:

price = e^(q1/b) / (e^(q1/b)+e^(q2/b)+e^(q3/b))



For an example calculation, say we have a market with three stocks, where there are 10 shares of stock 1 outstanding, 20 shares of stock 2, and 23 shares of stock 3. If we use 10 as the value for b, then the calculation for the price of stock 1 would be:

price = e^(10/10) / (e^(10/10)+e^(20/10)+e^(23/10)) = 0.1354

So in our example, we'd quote stock 1 at $13.53/share.

'''

'''
Costing a trade
In addition to quoting current stock prices, we also need to be able to determine the cost of a given trade. When using LMSR, this can be done with the cost function:

cost = b * ln(e^(q1/b) + e^(q2/b))

In order to determine the cost of a given trade, we need to compute the cost before the trade and the cost after the trade. The difference between these two is the amount that a trader must pay to acquire the shares. Extending our example above, let's say a trader wants to purchase 7 shares of stock 1. The cost before the trade would be:

cost = 10 * ln(e^(10/10) + e^(20/10) + e^(23/10)) = 29.998

And the cost after the trade would be:

cost = 10 * ln(e^(17/10) + e^(20/10) + e^(23/10)) = 31.284

And the cost of the trade is difference between the two: 31.284 - 29.998 = 1.286. Within Cultivate Forecasts, we multiply this by 100 to make the numbers a bit more fun and appealing (trading $128.60 is obviously much more fun than $1.286).
'''

# We set up the formula for calculations of different bets 
b = 50
options = ['Grant', 'JB', 'Connor', 'David', 'Bill', 'Matt']
bet_series_test = [('Grant', 50), ('JB', 30), ('Connor', 15), ('David', 24), ('Bill', 20), ('Matt', 20), ('Grant', 75), ('JB', 25), ('Connor', 10), ('David', 10), ('Bill', 10), ('Matt', 15), ('Grant', 10), ('JB', 10), ('Connor', 5), ('David', 5), ('Bill', 50), ('Matt', 5), ('Connor', 5), ('David', 50), ('Bill', 5), ('Matt', 50)]


# We assume a market with N stocks (aka choices/options)
# We want to track the market price, the cost of trades, and the payouts for each choice at the end, and for each bet

def run_calculation(quantities, bet, b, options):
    # calculates the price of a bet, and choice prices
    # bet is a tuple (choice, shares)
    # quantities is a dictionary mapping option names to outstanding shares
    choice, shares = bet
    
    # Validate that choice is a valid option
    if choice not in options:
        raise ValueError(f"Invalid choice '{choice}'. Must be one of: {options}")
    
    # Calculate current prices using LMSR formula
    # price_i = e^(q_i/b) / sum(e^(q_j/b) for all j in options)
    exp_values = {opt: math.exp(quantities[opt] / b) for opt in options}
    denominator = sum(exp_values.values())
    
    prices = {opt: exp_values[opt] / denominator for opt in options}
    
    # Calculate cost before trade
    # cost = b * ln(sum(e^(q_j/b) for all j in options))
    cost_before = b * math.log(denominator)
    
    # Calculate cost after trade
    quantities_new = quantities.copy()
    quantities_new[choice] += shares
    
    exp_values_new = {opt: math.exp(quantities_new[opt] / b) for opt in options}
    denominator_new = sum(exp_values_new.values())
    cost_after = b * math.log(denominator_new)
    
    # Calculate trade cost
    trade_cost = cost_after - cost_before
    
    # Print to console
    print(f"\n--- Trade: {shares} shares of '{choice}' ---")
    print(f"Current outstanding shares: {', '.join([f'{opt}={quantities[opt]}' for opt in options])}")
    print(f"Current prices: {', '.join([f'{opt}=${prices[opt]:.4f}' for opt in options])}")
    print(f"Cost before trade: ${cost_before:.4f}")
    print(f"Cost after trade: ${cost_after:.4f}")
    print(f"Trade cost: ${trade_cost:.4f}")
    
    return quantities_new, trade_cost


def run_market(bet_series, b, options):
    # Initialize tracking variables for outstanding shares
    quantities = {opt: 0 for opt in options}
    trades = []  # Track all trades for payout calculation
    
    print("=" * 50)
    print("Starting LMSR Market Simulation")
    print(f"LMSR constant (b): {b}")
    print(f"Options: {', '.join(options)}")
    print("=" * 50)
    
    # Process each bet in the series
    for bet in bet_series:
        quantities, trade_cost = run_calculation(quantities, bet, b, options)
        # Store trade information for payout calculation
        trades.append({
            'choice': bet[0],
            'shares': bet[1],
            'cost': trade_cost
        })
    
    # Calculate and print final market state
    print("\n" + "=" * 50)
    print("Final Market State")
    print("=" * 50)
    
    exp_values = {opt: math.exp(quantities[opt] / b) for opt in options}
    denominator = sum(exp_values.values())
    final_prices = {opt: exp_values[opt] / denominator for opt in options}
    
    print(f"Final outstanding shares: {', '.join([f'{opt}={quantities[opt]}' for opt in options])}")
    print(f"Final prices: {', '.join([f'{opt}=${final_prices[opt]:.4f}' for opt in options])}")
    print("=" * 50)
    
    # Calculate and print payouts for each trade
    print("\n" + "=" * 50)
    print("Payout Analysis for Each Trade")
    print("=" * 50)
    
    total_cost = 0
    total_payouts = {opt: 0.0 for opt in options}

    max_loss = b*math.log(len(options))

    for i, trade in enumerate(trades, 1):
        choice = trade['choice']
        shares = trade['shares']
        cost = trade['cost']
        total_cost += cost
        
        # In prediction markets, each share pays $1 if the outcome wins, $0 if it loses
        payouts = {}
        profits = {}
        for opt in options:
            payout = shares * 1.0 if choice == opt else 0.0
            payouts[opt] = payout
            profits[opt] = payout - cost
            total_payouts[opt] += payout
        
        print(f"\nTrade {i}: {shares} shares of '{choice}'")
        print(f"  Cost: ${cost:.4f}")
        for opt in options:
            print(f"  Payout if '{opt}' wins: ${payouts[opt]:.2f} (profit: ${profits[opt]:.4f})")
    
    # Print summary
    print("\n" + "-" * 50)
    print("Summary")
    print("-" * 50)
    print(f"Total cost of all trades: ${total_cost:.4f}")
    for opt in options:
        net_profit = total_payouts[opt] - total_cost
        print(f"Total payout if '{opt}' wins: ${total_payouts[opt]:.2f} (net profit: ${net_profit:.4f})")
    print(f"Maximum loss the market maker can incur is ${max_loss:.4f}")
    print("=" * 50)


run_market(bet_series_test, b, options)