// Telegram bot: sends zone alerts and takes simple commands from you.
// Setup: create a bot with @BotFather, put its token in TELEGRAM_BOT_TOKEN, then send /start to your bot.
// The first chat that messages the bot becomes the owner (saved to the data folder; you can also pin it
// with TELEGRAM_CHAT_ID). Everyone else is ignored.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getHoldings, setHolding } from './holdings.js';

const env = process.env;
const TOKEN = env.TELEGRAM_BOT_TOKEN || '';
const API = (env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, '');
const FILE = path.join(DATA_DIR, 'telegram.json');

let chatId = env.TELEGRAM_CHAT_ID || '';
if (!chatId && existsSync(FILE)) {
  try { chatId = String(JSON.parse(readFileSync(FILE, 'utf8')).chatId || ''); } catch {}
}

export const telegramReady = () => !!(TOKEN && chatId);
export const telegramConfigured = () => !!TOKEN;

async function call(method, body) {
  const r = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw Object.assign(new Error(d.description || `Telegram ${r.status}`), { code: d.error_code || r.status });
  return d.result;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function telegramSend(text, to = chatId) {
  if (!TOKEN || !to) return 'not connected';
  await call('sendMessage', { chat_id: to, text, parse_mode: 'HTML', disable_web_page_preview: true });
  return 'sent';
}

export function startTelegram({ assets, getMarkets, activeZone, fmt, fmtLevel, siteUrl }) {
  if (!TOKEN) return;
  const tickers = new Set(assets.map((a) => a.ticker));
  const NAME = { above: 'Above zones', below: 'Below zones', slow: 'Slow', moderate: 'Moderate', aggressive: 'Aggressive' };
  const DOT = { above: '⚪️', below: '⚪️', slow: '🟢', moderate: '🟡', aggressive: '🔴' };

  const HELP =
    '<b>Crypto Zones bot</b>\n' +
    'I message you when one of your coins moves into a different buy or sell zone.\n\n' +
    '/mycoins: your coins with price and current zones\n' +
    '/add AVAX LINK: turn alerts on for coins\n' +
    '/remove XRP: turn alerts off\n' +
    '/test: send a test alert\n' +
    'Or just send a ticker (e.g. <code>SOL</code>) for its zones.';

  async function coinLines(list) {
    const { coins } = await getMarkets();
    const price = new Map(coins.map((c) => [c.ticker, c.price]));
    return list.map((t) => {
      const a = assets.find((x) => x.ticker === t);
      const p = price.get(t);
      if (!a || p == null) return `<b>${t}</b>: price unavailable`;
      const zi = activeZone(a, p, 'in');
      const zo = activeZone(a, p, 'out');
      return `<b>${t}</b> ${fmt(p)}\n   Buy: ${DOT[zi]} ${NAME[zi]} · Sell: ${DOT[zo]} ${NAME[zo]}`;
    });
  }

  async function handle(msg) {
    const from = String(msg.chat.id);
    const text = (msg.text || '').trim();
    if (msg.chat.type !== 'private') return;

    if (!chatId) {
      chatId = from;
      try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify({ chatId })); } catch {}
      console.log(`Telegram connected to chat ${chatId}`);
      await telegramSend(
        `✅ <b>Connected!</b> Zone alerts for your coins will arrive here.\n\n` +
          `To keep this connected through redeploys, add a Railway variable:\n<code>TELEGRAM_CHAT_ID</code> = <code>${chatId}</code>\n\n` + HELP
      );
      return;
    }
    if (from !== chatId) {
      await telegramSend('This is a private bot.', from).catch(() => {});
      return;
    }

    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, '');
    const args = rest.join(' ').split(/[\s,]+/).map((s) => s.toUpperCase()).filter(Boolean);

    if (cmd === '/start' || cmd === '/help') return telegramSend(HELP);

    if (cmd === '/mycoins' || cmd === '/coins' || cmd === '/list') {
      const list = getHoldings();
      if (!list.length) return telegramSend('No coins have alerts on. Add some with /add BTC ETH');
      return telegramSend(`<b>Your coins (${list.length})</b>\n\n${(await coinLines(list)).join('\n')}`);
    }

    if (cmd === '/add' || cmd === '/remove') {
      if (!args.length) return telegramSend(`Tell me which coins, e.g. <code>${cmd} ${cmd === '/add' ? 'AVAX LINK' : 'XRP'}</code>`);
      const done = [], unknown = [];
      for (const t of args) (setHolding(t, cmd === '/add', tickers) ? done : unknown).push(t);
      let reply = done.length ? `${cmd === '/add' ? '🔔 Alerts on' : '🔕 Alerts off'}: ${done.join(', ')}` : 'Nothing changed.';
      if (unknown.length) reply += `\nNot on the zone list: ${esc(unknown.join(', '))}`;
      reply += `\n\nYour coins (${getHoldings().length}): ${getHoldings().join(', ') || 'none'}`;
      return telegramSend(reply);
    }

    if (cmd === '/test') return telegramSend('✅ <b>Test alert</b>\nAlerts are working. You\'ll hear from me when one of your coins changes zone.');

    const maybe = text.toUpperCase().replace(/^\$/, '');
    if (tickers.has(maybe)) {
      const a = assets.find((x) => x.ticker === maybe);
      const [line] = await coinLines([maybe]);
      const zi = a.ladderIn, zo = a.ladderOut;
      return telegramSend(
        `${line}\n\n<b>Buy zones</b>\n🟢 Slow ${fmtLevel(zi.slow[0])}–${fmtLevel(zi.slow[1])}\n🟡 Moderate ${fmtLevel(zi.moderate[0])}–${fmtLevel(zi.moderate[1])}\n🔴 Aggressive below ${fmtLevel(zi.aggressiveBelow)}` +
          `\n\n<b>Sell zones</b>\n🟢 Slow ${fmtLevel(zo.slow[0])}–${fmtLevel(zo.slow[1])}\n🟡 Moderate ${fmtLevel(zo.moderate[0])}–${fmtLevel(zo.moderate[1])}\n🔴 Aggressive above ${fmtLevel(zo.aggressiveAbove)}` +
          `\n\nAlerts: ${getHoldings().includes(maybe) ? '🔔 on' : '🔕 off'}${siteUrl ? `\n${siteUrl}` : ''}`
      );
    }
    return telegramSend(`I didn't get that.\n\n${HELP}`);
  }

  // Long-poll for messages
  let offset = 0;
  const loop = async () => {
    for (;;) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
        for (const u of updates) {
          offset = u.update_id + 1;
          if (u.message) await handle(u.message).catch((e) => console.warn('Telegram reply failed:', e.message));
        }
      } catch (e) {
        // 409 = another copy of the server is polling (normal for a few seconds during a redeploy)
        if (e.code === 401) { console.warn('Telegram token rejected — check TELEGRAM_BOT_TOKEN'); return; }
        await new Promise((r) => setTimeout(r, e.code === 409 ? 10_000 : 5_000));
      }
    }
  };
  call('setMyCommands', {
    commands: [
      { command: 'mycoins', description: 'Your coins, prices and zones' },
      { command: 'add', description: 'Turn alerts on: /add AVAX LINK' },
      { command: 'remove', description: 'Turn alerts off: /remove XRP' },
      { command: 'test', description: 'Send a test alert' },
      { command: 'help', description: 'What I can do' },
    ],
  }).catch(() => {});
  console.log(`Telegram bot ${chatId ? `connected to chat ${chatId}` : 'waiting for you to send /start'}`);
  loop();
}
