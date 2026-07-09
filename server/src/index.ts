import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { createPublicClient, getAddress, http, isAddress } from 'viem';
import { celo, celoAlfajores } from 'viem/chains';
import { sql, initSchema } from './db.ts';
import { redis, rateLimit } from './redis.ts';
import { rankFor } from './ranks.ts';
import { computeReward, signVoucher, signBadgeVoucher, signCapsuleVoucher, signerConfigured } from './signer.ts';
import { getPlayerAchievements, isBadgeEligible, ACHIEVEMENTS } from './achievements.ts';

// Must mirror the game's MAX_SPEED for the anti-cheat plausibility gate.
const MAX_SPEED = 64;

// Share-card assets (bundled, loaded once at boot).
const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '../assets');
GlobalFonts.registerFromPath(join(ASSET_DIR, 'anton.ttf'), 'Anton');
const cardBase = await loadImage(readFileSync(join(ASSET_DIR, 'card-base.jpg')));

const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const app = new Hono();

const CHAIN_ID = Number(process.env.CELO_CHAIN_ID || 44787);
const CELO_RPC_URL = process.env.CELO_RPC_URL || 'https://alfajores-forno.celo-testnet.org';
const PLAYER_REGISTRY_ADDRESS = process.env.PLAYER_REGISTRY_CONTRACT_ADDRESS;
const SEASON_MANAGER_ADDRESS = process.env.SEASON_MANAGER_CONTRACT_ADDRESS;

const PLAYER_REGISTRY_ABI = [
    {
        type: 'function',
        name: 'isRegistered',
        inputs: [{ name: 'wallet', type: 'address' }],
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
    },
] as const;

const SEASON_MANAGER_ABI = [
    {
        type: 'function',
        name: 'hasEntered',
        inputs: [
            { name: 'seasonId', type: 'uint256' },
            { name: 'player', type: 'address' },
        ],
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'hasVoted',
        inputs: [
            { name: 'proposalId', type: 'uint256' },
            { name: 'voter', type: 'address' },
        ],
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
    },
] as const;

const publicClient = createPublicClient({
    chain: CHAIN_ID === celo.id ? celo : celoAlfajores,
    transport: http(CELO_RPC_URL),
});

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

function normalizeWallet(raw: unknown): string | null {
    if (typeof raw !== 'string' || !isAddress(raw)) return null;
    return getAddress(raw).toLowerCase();
}

function shortWallet(wallet: string): string {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function cleanPlayerName(raw: unknown): { name: string; key: string } | null {
    if (typeof raw !== 'string') return null;
    const name = raw.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
    if (name.length < 3 || name.length > 16) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*[A-Za-z0-9]$/.test(name)) return null;
    const key = name.toLowerCase();
    if (['anon', 'admin', 'celo', 'rush', 'celo rush', 'bull rush'].includes(key)) return null;
    return { name, key };
}

async function isPlayerRegistered(wallet: string): Promise<boolean> {
    const rows = await sql`SELECT wallet FROM players WHERE wallet = ${wallet}`;
    if (rows.length > 0) return true;

    if (!PLAYER_REGISTRY_ADDRESS || !isAddress(PLAYER_REGISTRY_ADDRESS)) return false;

    const onChain = await publicClient.readContract({
        address: getAddress(PLAYER_REGISTRY_ADDRESS),
        abi: PLAYER_REGISTRY_ABI,
        functionName: 'isRegistered',
        args: [getAddress(wallet)],
    });

    if (onChain) {
        await sql`INSERT INTO players (wallet) VALUES (${wallet}) ON CONFLICT (wallet) DO NOTHING`;
    }

    return onChain;
}

async function seasonEnteredOnChain(seasonId: number, wallet: string): Promise<boolean> {
    if (!SEASON_MANAGER_ADDRESS || !isAddress(SEASON_MANAGER_ADDRESS)) return false;
    return publicClient.readContract({
        address: getAddress(SEASON_MANAGER_ADDRESS),
        abi: SEASON_MANAGER_ABI,
        functionName: 'hasEntered',
        args: [BigInt(seasonId), getAddress(wallet)],
    });
}

async function proposalVotedOnChain(proposalId: number, wallet: string): Promise<boolean> {
    if (!SEASON_MANAGER_ADDRESS || !isAddress(SEASON_MANAGER_ADDRESS)) return false;
    return publicClient.readContract({
        address: getAddress(SEASON_MANAGER_ADDRESS),
        abi: SEASON_MANAGER_ABI,
        functionName: 'hasVoted',
        args: [BigInt(proposalId), getAddress(wallet)],
    });
}

app.get('/api/players/:wallet', async (c) => {
    const wallet = normalizeWallet(c.req.param('wallet'));
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);

    const rows = await sql`SELECT wallet, name, registered_at FROM players WHERE wallet = ${wallet}`;
    if (rows.length === 0) {
        const registered = await isPlayerRegistered(wallet);
        return c.json({ registered, wallet: registered ? wallet : undefined, name: null });
    }

    return c.json({ registered: true, wallet: rows[0].wallet, name: rows[0].name ?? null, registeredAt: rows[0].registered_at });
});

app.post('/api/players/register', async (c) => {
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'register', 10, 60))) return c.json({ error: 'rate_limited' }, 429);

    const body = await c.req.json().catch(() => null);
    const wallet = normalizeWallet(body?.wallet);
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);

    const existing = await sql`SELECT wallet FROM players WHERE wallet = ${wallet}`;
    if (existing.length > 0) return c.json({ registered: true, wallet });

    if (!(await isPlayerRegistered(wallet))) return c.json({ error: 'not_registered_onchain' }, 400);

    await sql`INSERT INTO players (wallet) VALUES (${wallet}) ON CONFLICT (wallet) DO NOTHING`;
    return c.json({ registered: true, wallet });
});

app.post('/api/players/:wallet/name', async (c) => {
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'player-name', 12, 60))) return c.json({ error: 'rate_limited' }, 429);

    const wallet = normalizeWallet(c.req.param('wallet'));
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);
    if (!(await isPlayerRegistered(wallet))) return c.json({ error: 'player_not_registered' }, 403);

    const body = await c.req.json().catch(() => null);
    const cleaned = cleanPlayerName(body?.name);
    if (!cleaned) return c.json({ error: 'invalid_name' }, 400);

    const taken = await sql`SELECT wallet FROM players WHERE name_key = ${cleaned.key} AND wallet <> ${wallet} LIMIT 1`;
    if (taken.length > 0) return c.json({ error: 'name_taken' }, 409);

    await sql`
        INSERT INTO players (wallet, name, name_key)
        VALUES (${wallet}, ${cleaned.name}, ${cleaned.key})
        ON CONFLICT (wallet) DO UPDATE SET name = EXCLUDED.name, name_key = EXCLUDED.name_key
    `;
    return c.json({ registered: true, wallet, name: cleaned.name });
});

const StartRunSchema = z.object({
    wallet: z.string(),
    gameMode: z.enum(['casual', 'ranked']).default('casual'),
    runId: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

app.post('/api/run/start', async (c) => {
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'start', 60, 60))) return c.json({ error: 'rate_limited' }, 429);

    const parsed = StartRunSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'wallet_required' }, 400);
    const wallet = normalizeWallet(parsed.data.wallet);
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);
    if (!(await isPlayerRegistered(wallet))) return c.json({ error: 'player_not_registered' }, 403);
    if (parsed.data.gameMode === 'ranked' && !parsed.data.runId) return c.json({ error: 'run_id_required' }, 400);

    const token = randomUUID();
    const seed = randomBytes(16).toString('hex');
    await redis.set(
        `seed:${token}`,
        JSON.stringify({ seed, t: Date.now(), ip, wallet, gameMode: parsed.data.gameMode, runId: parsed.data.runId ?? null }),
        'EX',
        7200,
    );
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
    wallet: z.string(),
    gameMode: z.enum(['casual', 'ranked']).default('casual'),
    runId: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
    ref: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/).optional(),
});

app.post('/api/run/submit', async (c) => {
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'submit', 30, 60))) return c.json({ error: 'rate_limited' }, 429);

    const parsed = SubmitSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400);
    const b = parsed.data;
    const wallet = normalizeWallet(b.wallet);
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);
    if (!(await isPlayerRegistered(wallet))) return c.json({ error: 'player_not_registered' }, 403);

    // one-time token: must exist (issued by /run/start, not yet used)
    const stored = await redis.getdel(`seed:${b.token}`);
    if (!stored) return c.json({ error: 'invalid_token' }, 400);
    const runMeta = JSON.parse(stored) as { wallet?: string; gameMode?: 'casual' | 'ranked'; runId?: string | null };
    if (runMeta.wallet !== wallet) return c.json({ error: 'wallet_token_mismatch' }, 400);
    if (runMeta.gameMode !== b.gameMode) return c.json({ error: 'game_mode_mismatch' }, 400);
    if (b.gameMode === 'ranked' && (!b.runId || runMeta.runId !== b.runId)) return c.json({ error: 'run_id_mismatch' }, 400);

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
    const players = await sql`SELECT name FROM players WHERE wallet = ${wallet} LIMIT 1`;
    const playerName = typeof players[0]?.name === 'string' && players[0].name ? players[0].name : shortWallet(wallet);

    await sql`INSERT INTO runs ${sql({
        id,
        name: playerName,
        distance: b.distance,
        score: b.score,
        rank,
        death_cause: b.deathCause ?? null,
        jeets_dodged: b.jeetsDodged ?? 0,
        snipers_survived: b.snipersSurvived ?? 0,
        mev_avoided: b.mevAvoided ?? 0,
        max_combo: b.maxCombo ?? 0,
        duration_ms: b.durationMs,
        wallet,
        run_id: b.runId ?? null,
        game_mode: b.gameMode,
        referrer: b.ref ?? null,
        suspicious,
    })}`;

    if (suspicious) return c.json({ ok: true, hidden: true, rank });

    const positionRows = await sql`
        WITH best AS (
            SELECT wallet, MAX(distance) AS distance
            FROM runs
            WHERE suspicious = false
            GROUP BY wallet
        ), ranked AS (
            SELECT wallet, ROW_NUMBER() OVER (ORDER BY distance DESC) AS position
            FROM best
        )
        SELECT position FROM ranked WHERE wallet = ${wallet}
    `;
    const position = positionRows.length > 0 ? Number(positionRows[0].position) : null;
    return c.json({ ok: true, rank, position });
});

const ClaimVoucherSchema = z.object({
    runId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    score: z.number().int().min(0).max(50_000_000),
    wallet: z.string(),
});

app.post('/api/run/claim', async (c) => {
    if (!signerConfigured()) return c.json({ error: 'signer_not_configured' }, 503);
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'claim', 15, 60))) return c.json({ error: 'rate_limited' }, 429);

    const parsed = ClaimVoucherSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400);
    const b = parsed.data;
    const wallet = normalizeWallet(b.wallet);
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);
    if (!(await isPlayerRegistered(wallet))) return c.json({ error: 'player_not_registered' }, 403);

    const runs = await sql`
        SELECT id, score, suspicious, reward_claimed FROM runs
        WHERE wallet = ${wallet} AND run_id = ${b.runId} AND game_mode = 'ranked'
        ORDER BY created_at DESC LIMIT 1
    `;
    if (runs.length === 0) return c.json({ error: 'ranked_run_not_found' }, 404);
    const run = runs[0] as { id: string; score: number; suspicious: boolean; reward_claimed: boolean };
    if (run.suspicious) return c.json({ error: 'suspicious_run' }, 400);
    if (run.reward_claimed) return c.json({ error: 'already_claimed' }, 400);
    if (Number(run.score) !== b.score) return c.json({ error: 'score_mismatch' }, 400);

    const rewardAmount = computeReward(b.score);
    const voucher = await signVoucher({
        runId: b.runId,
        player: wallet,
        score: b.score,
        rewardAmount,
    });

    await sql`UPDATE runs SET reward_claimed = true WHERE id = ${run.id}`;

    return c.json(voucher);
});

app.get('/api/achievements/:wallet', async (c) => {
    const wallet = normalizeWallet(c.req.param('wallet'));
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);
    const result = await getPlayerAchievements(wallet);
    return c.json(result);
});

app.get('/api/achievements', (c) => {
    return c.json(ACHIEVEMENTS);
});

app.post('/api/achievements/claim', async (c) => {
    if (!signerConfigured()) return c.json({ error: 'signer_not_configured' }, 503);
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'badge', 10, 60))) return c.json({ error: 'rate_limited' }, 429);

    const body = await c.req.json().catch(() => null);
    const wallet = normalizeWallet(body?.wallet);
    const badgeId = Number(body?.badgeId || 0);
    if (!wallet || badgeId < 1) return c.json({ error: 'bad_request' }, 400);

    if (!(await isBadgeEligible(wallet, badgeId))) return c.json({ error: 'not_eligible' }, 400);

    const existing = await sql`SELECT badge_id FROM achievement_claims WHERE wallet = ${wallet} AND badge_id = ${badgeId}`;
    if (existing.length > 0) return c.json({ error: 'already_claimed' }, 400);

    const voucher = await signBadgeVoucher(badgeId, wallet);
    return c.json(voucher);
});

app.post('/api/achievements/sync', async (c) => {
    const body = await c.req.json().catch(() => null);
    const wallet = normalizeWallet(body?.wallet);
    const badgeId = Number(body?.badgeId || 0);
    if (!wallet || badgeId < 1) return c.json({ error: 'bad_request' }, 400);

    await sql`INSERT INTO achievement_claims (wallet, badge_id) VALUES (${wallet}, ${badgeId}) ON CONFLICT (wallet, badge_id) DO NOTHING`;
    return c.json({ ok: true });
});

app.get('/api/seasons/current', async (c) => {
    const now = new Date().toISOString();
    const rows = await sql`
        SELECT id, start_time, end_time, finalized FROM seasons
        WHERE start_time <= ${now} AND end_time >= ${now}
        ORDER BY id DESC LIMIT 1
    `;
    if (rows.length === 0) return c.json({ season: null });
    return c.json({ season: rows[0] });
});

app.get('/api/seasons/all', async (c) => {
    const rows = await sql`SELECT id, start_time, end_time, finalized FROM seasons ORDER BY id DESC LIMIT 10`;
    return c.json({ seasons: rows });
});

app.post('/api/seasons/enter', async (c) => {
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'season', 10, 60))) return c.json({ error: 'rate_limited' }, 429);

    const body = await c.req.json().catch(() => null);
    const wallet = normalizeWallet(body?.wallet);
    const seasonId = Number(body?.seasonId || 0);
    if (!wallet || seasonId < 1) return c.json({ error: 'bad_request' }, 400);

    const existing = await sql`SELECT wallet FROM season_entries WHERE season_id = ${seasonId} AND wallet = ${wallet}`;
    if (existing.length > 0) return c.json({ entered: true, seasonId });

    if (!(await seasonEnteredOnChain(seasonId, wallet))) return c.json({ error: 'not_entered_onchain' }, 400);

    await sql`INSERT INTO season_entries (season_id, wallet) VALUES (${seasonId}, ${wallet})`;
    return c.json({ entered: true, seasonId });
});

app.get('/api/seasons/:seasonId/hasEntered/:wallet', async (c) => {
    const wallet = normalizeWallet(c.req.param('wallet'));
    const seasonId = Number(c.req.param('seasonId'));
    if (!wallet || !seasonId) return c.json({ error: 'invalid' }, 400);

    const rows = await sql`SELECT wallet FROM season_entries WHERE season_id = ${seasonId} AND wallet = ${wallet}`;
    return c.json({ entered: rows.length > 0 });
});

app.get('/api/proposals/active', async (c) => {
    const now = new Date().toISOString();
    const rows = await sql`SELECT id, season_id, description, options, end_time FROM proposals WHERE end_time >= ${now} ORDER BY id DESC LIMIT 10`;
    const result = await Promise.all(rows.map(async (p: any) => {
        const votes = await sql`SELECT option_id, COUNT(*) as count FROM votes WHERE proposal_id = ${p.id} GROUP BY option_id`;
        const voteCounts = new Array(p.options.length).fill(0);
        for (const v of votes) voteCounts[Number(v.option_id)] = Number(v.count);
        return { id: p.id, seasonId: p.season_id, description: p.description, options: p.options, voteCounts, endTime: p.end_time };
    }));
    return c.json(result);
});

app.post('/api/proposals/vote', async (c) => {
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'vote', 20, 60))) return c.json({ error: 'rate_limited' }, 429);

    const body = await c.req.json().catch(() => null);
    const wallet = normalizeWallet(body?.wallet);
    const proposalId = Number(body?.proposalId || 0);
    const optionId = Number(body?.optionId || -1);
    if (!wallet || !proposalId || optionId < 0) return c.json({ error: 'bad_request' }, 400);

    const existing = await sql`SELECT wallet FROM votes WHERE proposal_id = ${proposalId} AND wallet = ${wallet}`;
    if (existing.length > 0) return c.json({ error: 'already_voted' }, 400);

    if (!(await proposalVotedOnChain(proposalId, wallet))) return c.json({ error: 'not_voted_onchain' }, 400);

    await sql`INSERT INTO votes (proposal_id, wallet, option_id) VALUES (${proposalId}, ${wallet}, ${optionId})`;
    return c.json({ ok: true });
});

app.get('/api/proposals/:id/vote/:wallet', async (c) => {
    const wallet = normalizeWallet(c.req.param('wallet'));
    const proposalId = Number(c.req.param('id'));
    if (!wallet || !proposalId) return c.json({ error: 'invalid' }, 400);

    const rows = await sql`SELECT option_id FROM votes WHERE proposal_id = ${proposalId} AND wallet = ${wallet}`;
    return c.json({ voted: rows.length > 0, optionId: rows.length > 0 ? Number(rows[0].option_id) : null });
});

app.post('/api/capsules/open', async (c) => {
    if (!signerConfigured()) return c.json({ error: 'signer_not_configured' }, 503);
    const ip = ipOf(c);
    if (!(await rateLimit(ip, 'capsule', 10, 60))) return c.json({ error: 'rate_limited' }, 429);

    const body = await c.req.json().catch(() => null);
    const wallet = normalizeWallet(body?.wallet);
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);
    if (!(await isPlayerRegistered(wallet))) return c.json({ error: 'player_not_registered' }, 403);

    const capsuleItems = [9, 10, 11, 12, 13]; // seeded cosmetic item IDs
    const randomItem = capsuleItems[Math.floor(Math.random() * capsuleItems.length)];
    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const price = 25n * 10n ** 18n;
    const voucher = await signCapsuleVoucher(randomItem, price, wallet, nonce);

    return c.json(voucher);
});

app.get('/api/players/:wallet/stats', async (c) => {
    const wallet = normalizeWallet(c.req.param('wallet'));
    if (!wallet) return c.json({ error: 'invalid_wallet' }, 400);

    const rows = await sql`
        SELECT
            COUNT(*) as total_runs,
            COALESCE(MAX(distance), 0) as best_distance,
            COALESCE(SUM(distance), 0) as lifetime_distance,
            COALESCE(SUM(score), 0) as total_score,
            COALESCE(MAX(score), 0) as best_score,
            COALESCE(SUM(jeets_dodged), 0) as total_jeets_dodged,
            COALESCE(SUM(snipers_survived), 0) as total_snipers_survived,
            COALESCE(SUM(mev_avoided), 0) as total_mev_avoided,
            COUNT(CASE WHEN suspicious = false THEN 1 END) as valid_runs
        FROM runs WHERE wallet = ${wallet}
    `;
    const stats = rows[0] || { total_runs: 0, best_distance: 0, lifetime_distance: 0, total_score: 0, best_score: 0, total_jeets_dodged: 0, total_snipers_survived: 0, total_mev_avoided: 0, valid_runs: 0 };
    return c.json(stats);
});

app.get('/api/leaderboard', async (c) => {
    const period = c.req.query('period') || 'alltime';
    const squad = c.req.query('squad');
    const limit = Math.min(Number(c.req.query('limit') || 100), 200);
    const timeClause = period === 'daily'
        ? sql`AND r.created_at >= now() - interval '1 day'`
        : period === 'weekly'
          ? sql`AND r.created_at >= now() - interval '7 days'`
          : sql``;
    const squadClause = squad && /^[A-Za-z0-9_-]{1,24}$/.test(squad) ? sql`AND r.referrer = ${squad}` : sql``;
    const entries = await sql`
        WITH ranked_runs AS (
            SELECT
                r.wallet,
                COALESCE(p.name, substring(r.wallet from 1 for 6) || '...' || right(r.wallet, 4)) AS name,
                r.distance,
                r.rank,
                ROW_NUMBER() OVER (PARTITION BY r.wallet ORDER BY r.distance DESC, r.score DESC, r.created_at ASC) AS wallet_rank
            FROM runs r
            LEFT JOIN players p ON p.wallet = r.wallet
            WHERE r.suspicious = false
            ${timeClause}
            ${squadClause}
        ), best AS (
            SELECT name, distance, rank
            FROM ranked_runs
            WHERE wallet_rank = 1
        )
        SELECT ROW_NUMBER() OVER (ORDER BY distance DESC) AS position, name, distance, rank
        FROM best
        ORDER BY distance DESC
        LIMIT ${limit}
    `;
    c.header('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    return c.json({ period: squad ? `squad:${squad}` : period, entries: entries.map((e) => ({
        position: Number(e.position),
        name: String(e.name),
        distance: Number(e.distance),
        rank: String(e.rank),
    })) });
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
