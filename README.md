# 🐂 BULL RUSH

A fast, dramatic **3D neon endless runner** for The Black Bull ($ANSEM) and the memecoin trenches. Charge forward, dodge Jeets / Snipers / MEV, grab powerups, and climb a global leaderboard — then share your run as a custom card.

**Play:** [trybullrush.xyz](https://trybullrush.xyz)

**Token CA (Solana):** `9LANU3GV8UjVg95zzbUQsz9bwsPxf232NmEAUm6upump` · [pump.fun](https://pump.fun/coin/9LANU3GV8UjVg95zzbUQsz9bwsPxf232NmEAUm6upump)

---

## Stack

- **Game (frontend):** React 19 + [React Three Fiber](https://github.com/pmndrs/react-three-fiber) + three.js + `@react-three/postprocessing` (bloom) + zustand + Vite. Deployed as a static site on **Cloudflare Pages**.
- **API (backend):** [Hono](https://hono.dev) on Node + **Redis** (rate limiting and one-time run tokens) + **MongoDB** (source of truth). Deployed on **Railway**.
- **Share cards:** dynamic OG image rendered server-side with `@napi-rs/canvas`.

## Project layout

```
src/                 # the game (R3F)
  three/             # Canvas, Bull, Track, Obstacles, Game
  ui/                # HTML/CSS overlays (menu, gate, HUD, board, share)
  data/              # questions, ranks, hazards
  store.ts           # zustand game state + per-frame refs
  api.ts             # thin client for the API (offline-safe)
functions/           # Cloudflare Pages Function (/s share page)
server/              # the Hono API (routes, redis, MongoDB, anti-cheat, OG card)
public/              # static assets (skybox, textures, logo, favicon, styles)
```

## Local development

**Game:**
```bash
npm install
npm run dev          # http://localhost:8080
```

**API** (needs Redis + MongoDB; uses the hosted services via the CLI):
```bash
cd server
npm install
railway run npm run dev
```

Environment: the game reads `VITE_API_URL` (in `.env.production`) — the public API base. The API reads `MONGODB_URI`, `MONGODB_DB`, `REDIS_URL`, `HMAC_SECRET`, `ALLOWED_ORIGIN`, `GAME_URL` (all set in Railway, never committed).

## Build & deploy

The complete encrypted DAU-booster and single-wallet autoplayer procedure is in
[`docs/dau-automation.md`](./docs/dau-automation.md).

```bash
npm run build                                   # game -> dist/
npx wrangler pages deploy dist --project-name bull-rush --branch main   # -> Cloudflare Pages

cd server && railway up --service bull-rush-api # API -> Railway
```

### Vercel

This repository includes `vercel.json`; connect the repository to Vercel with the project root set to this directory. Vercel uses `npm install`, `npm run build`, and `dist/` automatically. Add these Production environment variables in Vercel before the first deploy:

```text
VITE_API_URL
VITE_CELO_RPC_URL
VITE_CHAIN_ID=42220
VITE_GAMETOKEN_CONTRACT_ADDRESS
VITE_PLAYER_REGISTRY_CONTRACT_ADDRESS
VITE_CHECKIN_CONTRACT_ADDRESS
VITE_RUN_REWARDS_CONTRACT_ADDRESS
VITE_ARCADE_ITEMS_CONTRACT_ADDRESS
VITE_CUSD_CONTRACT_ADDRESS
VITE_WEEKLY_REWARDS_CONTRACT_ADDRESS
VITE_WEEKLY_REWARDS_ADMIN_ADDRESS
VITE_WALLETCONNECT_PROJECT_ID
```

The backend secrets (`SIGNER_PRIVATE_KEY`, `MONGODB_URI`, `REDIS_URL`, and `HMAC_SECRET`) belong in the API host, never in Vercel or the frontend bundle.

## A note on the music 🎵

The soundtrack (Ansem's favorite tracks) is **not** included in this repo — those files are copyrighted and kept local only. Drop your own `.mp3`s into `public/assets/audio/music/` matching the names in `src/audio.ts` (`super-rush`, `butterfly-war`, `night-cloud`, `green-motion`, `vamp-charge`). SFX are synthesized in-browser, so the game runs fine without them.

## License

[MIT](./LICENSE)

*Fan-made arcade game. Not financial advice, not an official endorsement.*
