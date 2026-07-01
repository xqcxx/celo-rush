import { Redis } from 'ioredis';

const url = process.env.REDIS_URL;
if (!url) throw new Error('REDIS_URL is required');

export const redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
});

export const LB = {
    alltime: 'lb:alltime',
    daily: () => `lb:daily:${new Date().toISOString().slice(0, 10)}`,
    weekly: () => `lb:weekly:${Math.floor(Date.now() / 6.048e8)}`,
    squad: (code: string) => `lb:squad:${code}`,
};

const DAY = 86400;

// Fixed-window rate limit. Returns true if the request is allowed.
export async function rateLimit(ip: string, route: string, limit: number, windowSec: number): Promise<boolean> {
    const key = `rl:${route}:${ip}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec);
    return n <= limit;
}

export async function recordScore(member: string, distance: number, squad?: string): Promise<void> {
    const pipe = redis.pipeline();
    pipe.zadd(LB.alltime, distance, member);
    pipe.zadd(LB.daily(), distance, member);
    pipe.expire(LB.daily(), DAY * 2);
    pipe.zadd(LB.weekly(), distance, member);
    pipe.expire(LB.weekly(), DAY * 9);
    if (squad) {
        pipe.zadd(LB.squad(squad), distance, member);
        pipe.expire(LB.squad(squad), DAY * 30);
    }
    await pipe.exec();
}

export interface LbEntry {
    position: number;
    name: string;
    distance: number;
    rank: string;
}

export async function topScores(key: string, limit: number): Promise<LbEntry[]> {
    const flat = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    const out: LbEntry[] = [];
    for (let i = 0; i < flat.length; i += 2) {
        try {
            const m = JSON.parse(flat[i]) as { n: string; r: string };
            out.push({ position: i / 2 + 1, name: m.n, distance: Number(flat[i + 1]), rank: m.r });
        } catch {
            // skip malformed member
        }
    }
    return out;
}
