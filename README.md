# 🐂 BULL RUSH

A fast, dramatic **3D neon endless runner** for The Black Bull ($ANSEM) and the memecoin trenches. Charge forward, dodge Jeets / Snipers / MEV, grab powerups, and climb a global leaderboard — then share your run as a custom card.

**Play:** [trybullrush.xyz](https://trybullrush.xyz)

---

## Stack

- **Game (frontend):** React 19 + [React Three Fiber](https://github.com/pmndrs/react-three-fiber) + three.js + `@react-three/postprocessing` (bloom) + zustand + Vite. Deployed as a static site on **Cloudflare Pages**.
- **API (backend):** [Hono](https://hono.dev) on Node + **Redis** (leaderboards via sorted sets, rate limiting, one-time run tokens) + **Postgres** (source of truth). Deployed on **Railway**.
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
server/              # the Hono API (routes, redis, postgres, anti-cheat, OG card)
public/              # static assets (skybox, textures, logo, favicon, styles)
```

## Local development

**Game:**
```bash
npm install
npm run dev          # http://localhost:8080
```

**API** (needs Redis + Postgres; uses the Railway ones via the CLI):
```bash
cd server
npm install
railway run npm run dev
```

Environment: the game reads `VITE_API_URL` (in `.env.production`) — the public API base. The API reads `DATABASE_URL`, `REDIS_URL`, `HMAC_SECRET`, `ALLOWED_ORIGIN`, `GAME_URL` (all set in Railway, never committed).

## Build & deploy

```bash
npm run build                                   # game -> dist/
npx wrangler pages deploy dist --project-name bull-rush --branch main   # -> Cloudflare Pages

cd server && railway up --service bull-rush-api # API -> Railway
```

## A note on the music 🎵

The soundtrack (Ansem's favorite tracks) is **not** included in this repo — those files are copyrighted and kept local only. Drop your own `.mp3`s into `public/assets/audio/music/` matching the names in `src/audio.ts` (`super-rush`, `butterfly-war`, `night-cloud`, `green-motion`, `vamp-charge`). SFX are synthesized in-browser, so the game runs fine without them.

## License

[MIT](./LICENSE)

*Fan-made arcade game. Not financial advice, not an official endorsement.*
