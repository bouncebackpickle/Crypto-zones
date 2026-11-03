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

## Zone-change alerts
The server checks prices every 60 seconds, around the clock. When a coin moves into a different buy or sell zone and stays there for 2 checks in a row, you get a notification, e.g. "🔴 BTC → Aggressive buy zone".

**Telegram (recommended: reliable phone notifications + text commands):**
1. In Telegram, message **@BotFather** → `/newbot` → pick any name and a username ending in `bot`. Copy the token it gives you.
2. In Railway → Variables, add `TELEGRAM_BOT_TOKEN` = that token and let it deploy.
3. Open your new bot in Telegram and send `/start`. It replies "Connected!" and gives you a `TELEGRAM_CHAT_ID`. Add that as a Railway variable too, so the bot stays connected after redeploys.
4. Bot commands: `/mycoins` (prices + zones), `/add AVAX LINK`, `/remove XRP`, `/test`, or send any ticker like `SOL` to see its zones.

The bot only answers you (the first chat that sent `/start`).

**Other channels** (optional, can be combined):
- ntfy app: `NTFY_TOPIC` (push can be unreliable on iPhone)
- Discord: `DISCORD_WEBHOOK_URL` (Channel settings → Integrations → Webhooks → Copy URL)

**Which coins alert: "My coins"**
Only coins you hold send alerts. To change the list:
- On the site, tap the 🔔 on any coin (or **Alerts on/off** in its detail panel). **🔔 My coins** filters the table to them.
- Or text the Telegram bot `/add AVAX` / `/remove XRP`, or open a URL "command": `your-site/api/holdings/add?coins=AVAX,LINK` or `your-site/api/holdings/remove?coins=XRP`
- Only the owner can change the list: the first user in `APP_USERS`, or set `ADMIN_USER`. Other logins don't see the bells.
- **Keep changes across redeploys:** in Railway, right-click the service → **Attach Volume** → mount path `/data`. Without a volume, the list resets to `alertHoldings` in `zones.json` on every deploy.

**Other option:** `ALERT_LADDERS`: `in` (buy only), `out` (sell only) or `in,out` (default)

`your-site/api/alerts` shows the alert settings and the last 20 alerts. After a redeploy the server starts fresh: it learns the current zones on its first check and alerts on changes from then on.

## How it works
- `server/index.js`: a small Express server. It serves the site and proxies CoinGecko. Prices are cached for 60s and coin details for 24h, so every visitor shares one set of API calls and the key never reaches the browser.
- `src/`: the React + Tailwind frontend. Charts use TradingView Lightweight Charts.
