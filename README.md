# Crypto Zones

A personal dashboard for DCA buy zones (ladder in) and sell zones (ladder out), with live prices from CoinGecko.

- **Ladder In / Ladder Out tabs**: every coin's active zone, distance to the next zone and a 7-day sparkline
- **Summary strip**: how many coins sit in each zone (tap one to filter)
- **Watchlist**: star coins (saved in your browser)
- **Coin drawer**: tap any coin to see a price chart with the zones shaded, both ladders, a short description, market stats and links

## Update your zones
Every zone lives in **`zones.json`**. Edit the numbers, commit and push, and Railway redeploys automatically.

```json
{
  "ticker": "BTC",
  "tier": "core",                 // "core" or "speculative"
  "snapshotPrice": 77554,         // roughly the price when you added it (used to match the right coin)
  "coingeckoId": "bitcoin",       // optional: the id in the coin's CoinGecko URL
  "ladderIn":  { "slow": [72000, 80000], "moderate": [58000, 72000], "aggressiveBelow": 58000 },
  "ladderOut": { "slow": [152000, 169000], "moderate": [169000, 195000], "aggressiveAbove": 195000 }
}
```

If a coin shows the wrong price, open `/api/ids` on your site to see what each ticker matched. Then set the correct `coingeckoId` (from the coin's CoinGecko URL, e.g. coingecko.com/en/coins/**bitcoin**).

## Run locally
```
npm install
npm run dev        # live CoinGecko data → http://localhost:5173
npm run dev:mock   # fake data, no internet needed
```

## Deploy on Railway
1. Railway → **New Project → Deploy from GitHub repo** → pick this repo. It builds with `npm run build` and starts with `npm start` on its own.
2. Service → **Settings → Networking → Generate Domain** to get your link.
3. Optional **Variables**:
   - `COINGECKO_API_KEY`: a free CoinGecko demo key (coingecko.com/en/api) for higher rate limits
   - `APP_USERS`: logins for everyone who can see the site, written as `name:password` pairs separated by commas, e.g. `dillon:MyPass123,alex:HisPass456`. To remove someone, delete their pair and save.
   - (`APP_USERNAME` + `APP_PASSWORD` still work for a single login.)

## How it works
- `server/index.js`: a small Express server. It serves the site and proxies CoinGecko. Prices are cached for 60s and coin details for 24h, so every visitor shares one set of API calls and the key never reaches the browser.
- `src/`: the React + Tailwind frontend. Charts use TradingView Lightweight Charts.
