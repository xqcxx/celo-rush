import { sql } from './db.ts';

export interface AchievementDef {
    id: number;
    name: string;
    description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
    { id: 1, name: 'First Ranked Run', description: 'Complete your first ranked run' },
    { id: 2, name: '1K Runner', description: 'Run 1,000 meters in a single game' },
    { id: 3, name: '5K Runner', description: 'Run 5,000 meters in a single game' },
    { id: 4, name: 'Marathon', description: 'Accumulate 10,000 meters lifetime distance' },
    { id: 5, name: 'Untouchable', description: 'Complete a run without taking any damage' },
    { id: 6, name: 'Scam Dodger', description: 'Dodge 100 scam bots lifetime' },
    { id: 7, name: 'Weekly Warrior', description: 'Place in the weekly top 100' },
    { id: 8, name: 'Top 10', description: 'Place in the weekly top 10' },
];

export async function getPlayerAchievements(wallet: string): Promise<{ earned: number[]; claimable: number[] }> {
    const earned: number[] = [];
    const claimable: number[] = [];

    if (!wallet) return { earned, claimable };

    const claimed = await sql`SELECT badge_id FROM achievement_claims WHERE wallet = ${wallet}`;
    const claimedSet = new Set(claimed.map((r: any) => r.badge_id));

    const stats = await sql`
        SELECT
            (SELECT COUNT(*) FROM runs WHERE wallet = ${wallet}) as total_runs,
            (SELECT MAX(distance) FROM runs WHERE wallet = ${wallet}) as best_distance,
            (SELECT COALESCE(SUM(distance), 0) FROM runs WHERE wallet = ${wallet}) as lifetime_distance,
            (SELECT MAX(jeets_dodged) FROM runs WHERE wallet = ${wallet}) as max_jeets_dodged,
            (SELECT COALESCE(SUM(jeets_dodged), 0) FROM runs WHERE wallet = ${wallet}) as total_jeets_dodged,
            (SELECT COUNT(*) FROM runs WHERE wallet = ${wallet} AND death_cause = 'Clean run') as clean_runs
    ` as any[];
    const s = stats[0] || { total_runs: 0, best_distance: 0, lifetime_distance: 0, total_jeets_dodged: 0, clean_runs: 0 };

    for (const ach of ACHIEVEMENTS) {
        if (claimedSet.has(ach.id)) {
            earned.push(ach.id);
            continue;
        }
        let eligible = false;
        switch (ach.id) {
            case 1: eligible = Number(s.total_runs) >= 1; break;
            case 2: eligible = Number(s.best_distance) >= 1000; break;
            case 3: eligible = Number(s.best_distance) >= 5000; break;
            case 4: eligible = Number(s.lifetime_distance) >= 10000; break;
            case 5: eligible = Number(s.clean_runs) >= 1; break;
            case 6: eligible = Number(s.total_jeets_dodged) >= 100; break;
            case 7: eligible = false; break; // weekly check handled separately
            case 8: eligible = false; break;
        }
        if (eligible) claimable.push(ach.id);
    }

    return { earned, claimable };
}

export async function isBadgeEligible(wallet: string, badgeId: number): Promise<boolean> {
    const { claimable } = await getPlayerAchievements(wallet);
    return claimable.includes(badgeId);
}
