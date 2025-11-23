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
b = 10
bet_series_test = [('yes', 5), ('no', 3), ('yes', 5), ('yes', 4), ('yes', 10), ('yes', 10), ('yes', 5), ('no', 5)]


# We assume a market with 2 stocks (aka choices), yes and no
# We want to track the market price, the cost of trades, and the payouts for each choice at the end, and for each bet

def run_calculation(q_yes, q_no, bet, b):
    # calculates the price of a bet, and choice prices
    # bet is a tuple (choice, shares)
    choice, shares = bet
    
    # Calculate current prices using LMSR formula
    # price = e^(q/b) / (e^(q1/b) + e^(q2/b))
    exp_yes = math.exp(q_yes / b)
    exp_no = math.exp(q_no / b)
    denominator = exp_yes + exp_no
    
    price_yes = exp_yes / denominator
    price_no = exp_no / denominator
    
    # Calculate cost before trade
    cost_before = b * math.log(exp_yes + exp_no)
    
    # Calculate cost after trade
    q_yes_new = q_yes + (shares if choice == 'yes' else 0)
    q_no_new = q_no + (shares if choice == 'no' else 0)
    
    exp_yes_new = math.exp(q_yes_new / b)
    exp_no_new = math.exp(q_no_new / b)
    cost_after = b * math.log(exp_yes_new + exp_no_new)
    
    # Calculate trade cost
    trade_cost = cost_after - cost_before
    
    # Print to console
    print(f"\n--- Trade: {shares} shares of '{choice}' ---")
    print(f"Current outstanding shares: Yes={q_yes}, No={q_no}")
    print(f"Current prices: Yes=${price_yes:.4f}, No=${price_no:.4f}")
    print(f"Cost before trade: ${cost_before:.4f}")
    print(f"Cost after trade: ${cost_after:.4f}")
    print(f"Trade cost: ${trade_cost:.4f}")
    
    return q_yes_new, q_no_new, trade_cost


def run_market(bet_series, b):
    # Initialize tracking variables for outstanding shares
    q_yes = 0
    q_no = 0
    trades = []  # Track all trades for payout calculation
    
    print("=" * 50)
    print("Starting LMSR Market Simulation")
    print(f"LMSR constant (b): {b}")
    print("=" * 50)
    
    # Process each bet in the series
    for bet in bet_series:
        q_yes, q_no, trade_cost = run_calculation(q_yes, q_no, bet, b)
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
    
    exp_yes = math.exp(q_yes / b)
    exp_no = math.exp(q_no / b)
    denominator = exp_yes + exp_no
    
    final_price_yes = exp_yes / denominator
    final_price_no = exp_no / denominator
    
    print(f"Final outstanding shares: Yes={q_yes}, No={q_no}")
    print(f"Final prices: Yes=${final_price_yes:.4f}, No=${final_price_no:.4f}")
    print("=" * 50)
    
    # Calculate and print payouts for each trade
    print("\n" + "=" * 50)
    print("Payout Analysis for Each Trade")
    print("=" * 50)
    
    total_cost = 0
    total_payout_if_yes = 0
    total_payout_if_no = 0
    
    for i, trade in enumerate(trades, 1):
        choice = trade['choice']
        shares = trade['shares']
        cost = trade['cost']
        total_cost += cost
        
        # In prediction markets, each share pays $1 if the outcome wins, $0 if it loses
        payout_if_yes = shares * 1.0 if choice == 'yes' else 0.0
        payout_if_no = shares * 1.0 if choice == 'no' else 0.0
        
        total_payout_if_yes += payout_if_yes
        total_payout_if_no += payout_if_no
        
        profit_if_yes = payout_if_yes - cost
        profit_if_no = payout_if_no - cost
        
        print(f"\nTrade {i}: {shares} shares of '{choice}'")
        print(f"  Cost: ${cost:.4f}")
        print(f"  Payout if 'yes' wins: ${payout_if_yes:.2f} (profit: ${profit_if_yes:.4f})")
        print(f"  Payout if 'no' wins: ${payout_if_no:.2f} (profit: ${profit_if_no:.4f})")
    
    # Print summary
    print("\n" + "-" * 50)
    print("Summary")
    print("-" * 50)
    print(f"Total cost of all trades: ${total_cost:.4f}")
    print(f"Total payout if 'yes' wins: ${total_payout_if_yes:.2f}")
    print(f"Total payout if 'no' wins: ${total_payout_if_no:.2f}")
    print(f"Net profit if 'yes' wins: ${total_payout_if_yes - total_cost:.4f}")
    print(f"Net profit if 'no' wins: ${total_payout_if_no - total_cost:.4f}")
    print("=" * 50)


run_market(bet_series_test, b)