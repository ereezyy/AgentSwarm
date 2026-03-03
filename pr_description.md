🧪 [testing improvement] Test Kelly Bet Sizing Logic

🎯 **What:** The purely mathematical function `calculateKellyBet` inside `don/pumpsniper.js` was untested. A modification was made to conditionally export it along with `neuralConfig` to allow testing, and an extensive suite of tests was added.

📊 **Coverage:** The new tests cover several edge cases and critical safety rails:
* Handling of balances below the absolute minimum threshold.
* Correct application of Kelly calculations at 0% rug probability.
* Correct clamping against max position exposure limits (5% of total balance).
* Handling scenarios where Kelly suggests negative bets (applying `min_bet` floors).
* Fractional Kelly adjustments based on config values.
* Ensuring the logic correctly returns bets between bounds.

✨ **Result:** Increased test coverage for the `pumpsniper.js` agent. The `calculateKellyBet` function logic is now thoroughly tested in a fast, standalone, and deterministic way using Jest mocks.
