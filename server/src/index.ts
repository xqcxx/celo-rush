import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { sql, initSchema } from './db.ts';
import { redis, LB, rateLimit, recordScore, topScores } from './redis.ts';
import { rankFor } from './ranks.ts';

// Must mirror the game's MAX_SPEED for the anti-cheat plausibility gate.
const MAX_SPEED = 64;

// Share-card assets (bundled, loaded once at boot).
const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '../assets');
GlobalFonts.registerFromPath(join(ASSET_DIR, 'anton.ttf'), 'Anton');
const cardBase = await loadImage(readFileSync(join(ASSET_DIR, 'card-base.jpg')));

const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const app = new Hono();

const allow = (process.env.ALLOWED_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(
    '*',
    cors({
        origin: (o) => (allow.includes('*') ? o || '*' : allow.includes(o) ? o : allow[0] || ''),
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
    }),
);

const ipOf = (c: { req: { header: (k: string) => string | undefined } }) =>
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'anon';

app.get('/', (c) => c.text('BULL RUSH API — charge.'));
app.get('/health', (c) => c.json({ ok: true }));

app.post('/api/run/start', async (c) => {
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'start', 60, 60))) return c.json({ error: 'rate_limited' }, 429);

    const token = randomUUID();
    const seed = randomBytes(16).toString('hex');
    await redis.set(`seed:${token}`, JSON.stringify({ seed, t: Date.now(), ip }), 'EX', 180);
    return c.json({ seed, token });
});

const SubmitSchema = z.object({
    token: z.string().min(8).max(64),
    name: z
        .string()
        .max(24)
        .transform((s) => s.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 16) || 'ANON'),
    distance: z.number().int().min(0).max(10_000_000),
    score: z.number().int().min(0).max(50_000_000),
    durationMs: z.number().int().min(0).max(7_200_000),
    deathCause: z.string().max(40).optional(),
    jeetsDodged: z.number().int().min(0).max(100_000).optional(),
    snipersSurvived: z.number().int().min(0).max(100_000).optional(),
    mevAvoided: z.number().int().min(0).max(100_000).optional(),
    maxCombo: z.number().int().min(0).max(100_000).optional(),
    wallet: z.string().max(64).optional(),
    ref: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/).optional(),
});

app.post('/api/run/submit', async (c) => {
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'submit', 30, 60))) return c.json({ error: 'rate_limited' }, 429);

    const parsed = SubmitSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400);
    const b = parsed.data;

    // one-time token: must exist (issued by /run/start, not yet used)
    const stored = await redis.getdel(`seed:${b.token}`);
    if (!stored) return c.json({ error: 'invalid_token' }, 400);

    // anti-cheat plausibility gate
    const sec = b.durationMs / 1000;
    const maxDist = MAX_SPEED * sec * 1.15 + 200;
    const suspicious =
        b.durationMs < 1500 ||
        b.distance > maxDist ||
        b.score > b.distance * 3 + 10_000 ||
        (b.jeetsDodged ?? 0) > sec * 6 + 20;

    const id = randomUUID();
    const rank = rankFor(b.distance);

    await sql`INSERT INTO runs ${sql({
        id,
        name: b.name,
        distance: b.distance,
        score: b.score,
        rank,
        death_cause: b.deathCause ?? null,
        jeets_dodged: b.jeetsDodged ?? 0,
        snipers_survived: b.snipersSurvived ?? 0,
        mev_avoided: b.mevAvoided ?? 0,
        max_combo: b.maxCombo ?? 0,
        duration_ms: b.durationMs,
        wallet: b.wallet ?? null,
        referrer: b.ref ?? null,
        suspicious,
    })}`;

    if (suspicious) return c.json({ ok: true, hidden: true, rank });

    const member = JSON.stringify({ n: b.name, r: rank, id });
    await recordScore(member, b.distance, b.ref);
    const position = await redis.zrevrank(LB.alltime, member);
    return c.json({ ok: true, rank, position: position === null ? null : position + 1 });
});

app.get('/api/leaderboard', async (c) => {
    const period = c.req.query('period') || 'alltime';
    const squad = c.req.query('squad');
    const limit = Math.min(Number(c.req.query('limit') || 100), 200);
    const key = squad ? LB.squad(squad) : period === 'daily' ? LB.daily() : period === 'weekly' ? LB.weekly() : LB.alltime;
    const entries = await topScores(key, limit);
    c.header('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    return c.json({ period: squad ? `squad:${squad}` : period, entries });
});

// Dynamic OG share card — the bull image with this run's score burned in.
app.get('/api/card.png', (c) => {
    const d = Math.max(0, Math.min(9_999_999, Number(c.req.query('d')) || 0));
    const name = (c.req.query('n') || 'ANON').replace(/[^\x20-\x7E]/g, '').slice(0, 16).toUpperCase() || 'ANON';
    const rank = (c.req.query('r') || '').replace(/[^\x20-\x7E]/g, '').slice(0, 24).toUpperCase();

    const W = 1200;
    const H = 675;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cardBase, 0, 0, W, H);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#9fb0c3';
    ctx.font = '30px Anton';
    ctx.fillText(`${name} CHARGED`, 712, 215);

    ctx.shadowColor = 'rgba(57,255,20,0.85)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#39ff14';
    ctx.font = '128px Anton';
    ctx.fillText(`${d.toLocaleString()}m`, 708, 345);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#7fffd4';
    ctx.font = '44px Anton';
    ctx.fillText(rank, 712, 420);

    ctx.fillStyle = '#8a93a6';
    ctx.font = '26px Anton';
    ctx.fillText('CAN YOU SURVIVE THE TRENCHES?', 712, 520);
    ctx.fillStyle = '#ff2d3a';
    ctx.font = '46px Anton';
    ctx.fillText('$ANSEM', 712, 576);

    return new Response(canvas.toBuffer('image/png'), {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    });
});

// Share landing page — gives X a per-run OG card, then bounces humans to the game.
app.get('/s', (c) => {
    const d = (c.req.query('d') || '0').replace(/[^0-9]/g, '').slice(0, 9) || '0';
    const n = (c.req.query('n') || 'ANON').slice(0, 16);
    const r = (c.req.query('r') || '').slice(0, 24);
    const host = c.req.header('host') || 'bull-rush-api-production.up.railway.app';
    const card = `https://${host}/api/card.png?d=${encodeURIComponent(d)}&n=${encodeURIComponent(n)}&r=${encodeURIComponent(r)}`;
    const game = process.env.GAME_URL || 'https://bull-rush.pages.dev';
    const title = esc(`${n} charged ${Number(d).toLocaleString()}m in BULL RUSH`);
    const desc = esc(`Rank: ${r || 'Paper Horn'}. Can you survive the trenches? $ANSEM`);
    return c.html(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${esc(card)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${esc(card)}">
<meta http-equiv="refresh" content="0;url=${esc(game)}">
</head><body style="background:#05060a;color:#39ff14;font-family:monospace;text-align:center;padding-top:48px">
Charging into BULL RUSH… <a style="color:#39ff14" href="${esc(game)}">tap to play</a></body></html>`,
    );
});

const port = Number(process.env.PORT || 8787);
await initSchema();
serve({ fetch: app.fetch, port }, (info) => console.log(`BULL RUSH API listening on :${info.port}`));
