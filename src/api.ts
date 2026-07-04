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

export interface SubmitPayload {
    token: string;
    name: string;
    distance: number;
    score: number;
    durationMs: number;
    deathCause?: string;
    wallet?: string;
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

export async function startRun(wallet?: string | null): Promise<{ seed: string; token: string | null }> {
    if (!BASE) return { seed: localSeed(), token: null };
    if (!wallet) return { seed: localSeed(), token: null };
    try {
        const r = await fetch(`${BASE}/api/run/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet }),
        });
        if (!r.ok) throw new Error('start failed');
        const d = (await r.json()) as { seed: string; token: string };
        return { seed: d.seed, token: d.token };
    } catch {
        return { seed: localSeed(), token: null };
    }
}

export async function submitRun(p: SubmitPayload): Promise<{ rank: string; position: number | null } | null> {
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
        if (!r.ok) return null;
        return (await r.json()) as { rank: string; position: number | null };
    } catch {
        return null;
    }
}

export async function checkPlayerRegistration(wallet: string): Promise<boolean> {
    if (!BASE || !wallet) return false;
    try {
        const r = await fetch(`${BASE}/api/players/${wallet.toLowerCase()}`);
        if (!r.ok) return false;
        const d = (await r.json()) as { registered: boolean };
        return d.registered === true;
    } catch {
        return false;
    }
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

export interface RewardVoucher {
    runId: string;
    player: string;
    score: number;
    rewardAmount: number;
    deadline: number;
    signature: string;
}

export async function claimRunReward(runId: string, score: number, wallet: string): Promise<RewardVoucher | null> {
    if (!BASE) return null;
    try {
        const r = await fetch(`${BASE}/api/run/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId, score, wallet }),
        });
        if (!r.ok) return null;
        return (await r.json()) as RewardVoucher;
    } catch {
        return null;
    }
}

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
