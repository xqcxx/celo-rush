// Thin client for the Railway API. Everything degrades gracefully: if VITE_API_URL
// is unset or the backend is unreachable, the game still plays fully offline and
// falls back to local high scores.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

export const apiEnabled = BASE.length > 0;

export interface LbEntry {
    position: number;
    name: string;
    distance: number;
    rank: string;
}

export interface PlayerProfile {
    registered: boolean;
    wallet?: string;
    name: string | null;
    registeredAt?: string;
}

export interface SubmitPayload {
    token: string;
    name: string;
    distance: number;
    score: number;
    durationMs: number;
    deathCause?: string;
    wallet?: string;
    gameMode?: 'casual' | 'ranked';
    runId?: string | null;
    ref?: string;
}

function localSeed(): string {
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// Share link on the GAME's own domain (a Cloudflare Pages Function at /s serves
// the per-run OG card to X, then bounces players to the game). Branded + clean.
export function shareLink(p: { distance: number; rank: string; name: string }): string | null {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams({ d: String(p.distance), r: p.rank, n: p.name });
    return `${window.location.origin}/s?${q.toString()}`;
}

export async function startRun(
    wallet?: string | null,
    gameMode: 'casual' | 'ranked' = 'casual',
    runId?: string | null,
): Promise<{ seed: string; token: string | null }> {
    if (!BASE) return { seed: localSeed(), token: null };
    if (!wallet) return { seed: localSeed(), token: null };
    try {
        const r = await fetch(`${BASE}/api/run/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet, gameMode, runId: runId || undefined }),
        });
        if (!r.ok) throw new Error('start failed');
        const d = (await r.json()) as { seed: string; token: string };
        return { seed: d.seed, token: d.token };
    } catch {
        return { seed: localSeed(), token: null };
    }
}

export interface SubmitResult {
    rank: string;
    position: number | null;
    hidden?: boolean;
}

export async function submitRun(p: SubmitPayload): Promise<SubmitResult | null> {
    if (!BASE) return null;
    try {
        const r = await fetch(`${BASE}/api/run/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...p,
                wallet: p.wallet || undefined,
            }),
        });
        const d = await r.json().catch(() => null) as { rank?: string; position?: number | null; hidden?: boolean; error?: string } | null;
        if (!r.ok) throw new Error(d?.error || `submit_failed_${r.status}`);
        return d as SubmitResult;
    } catch (e) {
        console.error('Run submit failed', e);
        return null;
    }
}

export async function getPlayerProfile(wallet: string): Promise<PlayerProfile | null> {
    if (!BASE || !wallet) return null;
    try {
        const r = await fetch(`${BASE}/api/players/${wallet.toLowerCase()}`);
        if (!r.ok) return null;
        return (await r.json()) as PlayerProfile;
    } catch {
        return null;
    }
}

export async function checkPlayerRegistration(wallet: string): Promise<boolean> {
    const profile = await getPlayerProfile(wallet);
    return profile?.registered === true;
}

export async function registerPlayer(wallet: string): Promise<boolean> {
    if (!BASE || !wallet) return false;
    try {
        const r = await fetch(`${BASE}/api/players/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: wallet.toLowerCase() }),
        });
        if (!r.ok) return false;
        const d = (await r.json()) as { registered: boolean };
        return d.registered === true;
    } catch {
        return false;
    }
}

export async function setPlayerName(wallet: string, name: string): Promise<PlayerProfile> {
    if (!BASE || !wallet) throw new Error('api_disabled');
    const r = await fetch(`${BASE}/api/players/${wallet.toLowerCase()}/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    const d = await r.json().catch(() => null) as (PlayerProfile & { error?: string }) | null;
    if (!r.ok) throw new Error(d?.error || `name_failed_${r.status}`);
    return d as PlayerProfile;
}

export interface RewardVoucher {
    runId: string;
    player: string;
    score: number;
    rewardAmount: string;
    deadline: number;
    signature: string;
}

export async function claimRunReward(runId: string, score: number, wallet: string): Promise<RewardVoucher | null> {
    if (!BASE) return null;
    const r = await fetch(`${BASE}/api/run/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, score, wallet }),
    });
    if (!r.ok) {
        const d = await r.json().catch(() => null) as { error?: string } | null;
        throw new Error(d?.error || `claim_failed_${r.status}`);
    }
    return (await r.json()) as RewardVoucher;
}

export interface ShopItem {
    id: number;
    name: string;
    description: string;
    priceRush: number;
    category: 'skin' | 'trail' | 'theme' | 'badge';
    maxLevel: number;
}

export const SHOP_ITEMS: ShopItem[] = [
    { id: 9, name: 'Celo Green Runner', description: 'A sleek green runner skin', priceRush: 50, category: 'skin', maxLevel: 3 },
    { id: 10, name: 'MiniPay Jacket', description: 'Fresh MiniPay-branded jacket', priceRush: 35, category: 'skin', maxLevel: 3 },
    { id: 11, name: 'Gold Trail', description: 'Leave a trail of gold dust', priceRush: 40, category: 'trail', maxLevel: 3 },
    { id: 12, name: 'Rugproof Armor', description: 'Treated with rug-proof coating', priceRush: 60, category: 'skin', maxLevel: 3 },
    { id: 13, name: 'Stablecoin Magnet', description: 'Magnetic trail that attracts pickups', priceRush: 45, category: 'trail', maxLevel: 3 },
];

export async function getLeaderboard(
    period: 'alltime' | 'daily' | 'weekly' = 'alltime',
    squad?: string,
): Promise<LbEntry[] | null> {
    if (!BASE) return null;
    try {
        const q = new URLSearchParams({ period, limit: '20' });
        if (squad) q.set('squad', squad);
        const r = await fetch(`${BASE}/api/leaderboard?${q.toString()}`);
        if (!r.ok) return null;
        const d = (await r.json()) as { entries: LbEntry[] };
        return d.entries;
    } catch {
        return null;
    }
}
