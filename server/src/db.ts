import { MongoClient, type Collection, type Db } from 'mongodb';

const shortWallet = (wallet: string) => `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');

const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10_000 });
let database: Db;
let players: Collection<PlayerDoc>;
let runs: Collection<RunDoc>;
let achievementClaims: Collection<AchievementClaimDoc>;
let weeklyRequests: Collection<WeeklyRequestDoc>;
let seasons: Collection<SeasonDoc>;
let seasonEntries: Collection<SeasonEntryDoc>;
let proposals: Collection<ProposalDoc>;
let votes: Collection<VoteDoc>;

export interface PlayerDoc { wallet: string; name?: string | null; name_key?: string | null; registered_at: Date; }
export interface RunDoc {
    id: string; token?: string; name: string; distance: number; score: number; rank: string; death_cause?: string | null;
    jeets_dodged: number; snipers_survived: number; mev_avoided: number; max_combo: number; damage_taken: number; duration_ms: number;
    wallet: string; run_id?: string | null; game_mode: 'casual' | 'ranked'; reward_claimed: boolean;
    claim_state?: 'available' | 'voucher_issued' | 'confirmed'; claim_tx_hash?: string | null;
    referrer?: string | null; suspicious: boolean; created_at: Date;
}
interface AchievementClaimDoc { wallet: string; badge_id: number; claimed_at: Date; }
export interface WeeklyRequestDoc {
    week: number;
    wallet: string;
    tx_hash: string;
    requested_at: Date;
}
export interface SeasonDoc { id: number; start_time: Date; end_time: Date; finalized: boolean; }
interface SeasonEntryDoc { season_id: number; wallet: string; entered_at: Date; }
export interface ProposalDoc { id: number; season_id: number; description: string; options: string[]; end_time: Date; }
interface VoteDoc { proposal_id: number; wallet: string; option_id: number; voted_at: Date; }

export async function initSchema(): Promise<void> {
    await client.connect();
    database = client.db(process.env.MONGODB_DB || 'bullrush');
    players = database.collection<PlayerDoc>('players');
    runs = database.collection<RunDoc>('runs');
    achievementClaims = database.collection<AchievementClaimDoc>('achievement_claims');
    weeklyRequests = database.collection<WeeklyRequestDoc>('weekly_reward_requests');
    seasons = database.collection<SeasonDoc>('seasons');
    seasonEntries = database.collection<SeasonEntryDoc>('season_entries');
    proposals = database.collection<ProposalDoc>('proposals');
    votes = database.collection<VoteDoc>('votes');

    await Promise.all([
        players.createIndex({ wallet: 1 }, { unique: true }),
        players.createIndex({ name_key: 1 }, { unique: true, sparse: true }),
        runs.createIndex({ wallet: 1, distance: -1 }),
        runs.createIndex({ created_at: -1 }),
        runs.createIndex({ wallet: 1, run_id: 1, game_mode: 1, created_at: -1 }),
        runs.createIndex({ token: 1 }, { unique: true, sparse: true }),
        achievementClaims.createIndex({ wallet: 1, badge_id: 1 }, { unique: true }),
        weeklyRequests.createIndex({ week: 1, wallet: 1 }, { unique: true }),
        weeklyRequests.createIndex({ requested_at: -1 }),
        seasons.createIndex({ id: -1 }),
        seasonEntries.createIndex({ season_id: 1, wallet: 1 }, { unique: true }),
        proposals.createIndex({ end_time: 1, id: -1 }),
        votes.createIndex({ proposal_id: 1, wallet: 1 }, { unique: true }),
    ]);
}

export const db = {
    async findPlayer(wallet: string) { return players.findOne({ wallet }); },
    async ensurePlayer(wallet: string) {
        await players.updateOne({ wallet }, { $setOnInsert: { wallet, registered_at: new Date() } }, { upsert: true });
    },
    async findPlayerByNameKey(name_key: string, exceptWallet?: string) {
        return players.findOne({ name_key, ...(exceptWallet ? { wallet: { $ne: exceptWallet } } : {}) });
    },
    async updatePlayerName(wallet: string, name: string, name_key: string) {
        await players.updateOne({ wallet }, { $set: { name, name_key }, $setOnInsert: { registered_at: new Date() } }, { upsert: true });
    },
    async insertRun(run: RunDoc) { await runs.insertOne(run); },
    async findRunByToken(token: string) { return runs.findOne({ token }); },
    async getBestPosition(wallet: string) {
        const best = await runs.aggregate<{ _id: string; distance: number }>([
            { $match: { suspicious: false, game_mode: 'ranked' } },
            { $group: { _id: '$wallet', distance: { $max: '$distance' } } },
            { $sort: { distance: -1 } },
        ]).toArray();
        const index = best.findIndex((row) => row._id === wallet);
        return index < 0 ? null : index + 1;
    },
    async findRankedRun(wallet: string, runId: string) {
        return runs.findOne({ wallet, run_id: runId, game_mode: 'ranked' }, { sort: { created_at: -1 } });
    },
    async markRewardClaimed(id: string) {
        return runs.updateOne({ id }, { $set: { reward_claimed: true, claim_state: 'confirmed' } });
    },
    async markVoucherIssued(id: string) {
        return runs.updateOne({ id, reward_claimed: { $ne: true } }, { $set: { claim_state: 'voucher_issued' } });
    },
    async findAchievementClaim(wallet: string, badge_id: number) { return achievementClaims.findOne({ wallet, badge_id }); },
    async listAchievementClaims(wallet: string) { return achievementClaims.find({ wallet }).toArray(); },
    async insertAchievementClaim(wallet: string, badge_id: number) {
        await achievementClaims.updateOne({ wallet, badge_id }, { $setOnInsert: { wallet, badge_id, claimed_at: new Date() } }, { upsert: true });
    },
    async insertWeeklyRequest(week: number, wallet: string, tx_hash: string) {
        await weeklyRequests.updateOne({ week, wallet }, { $setOnInsert: { week, wallet, tx_hash, requested_at: new Date() } }, { upsert: true });
    },
    async listWeeklyRequests() { return weeklyRequests.find().sort({ week: -1, requested_at: -1 }).toArray(); },
    async walletWeeks(wallet: string) {
        const rows = await runs.aggregate<{ _id: number }>([
            { $match: { wallet, game_mode: 'ranked', suspicious: false } },
            { $project: { week: { $floor: { $divide: [{ $toLong: '$created_at' }, 604800000] } } } },
            { $group: { _id: '$week' } },
            { $sort: { _id: -1 } },
        ]).toArray();
        return rows.map((row) => Number(row._id));
    },
    async currentSeason(now: Date) { return seasons.find({ start_time: { $lte: now }, end_time: { $gte: now } }).sort({ id: -1 }).limit(1).next(); },
    async listSeasons() { return seasons.find().sort({ id: -1 }).limit(10).toArray(); },
    async hasSeasonEntry(season_id: number, wallet: string) { return !!(await seasonEntries.findOne({ season_id, wallet })); },
    async addSeasonEntry(season_id: number, wallet: string) { await seasonEntries.updateOne({ season_id, wallet }, { $setOnInsert: { season_id, wallet, entered_at: new Date() } }, { upsert: true }); },
    async activeProposals(now: Date) { return proposals.find({ end_time: { $gte: now } }).sort({ id: -1 }).limit(10).toArray(); },
    async proposalVoteCounts(proposal_id: number) {
        return votes.aggregate<{ _id: number; count: number }>([
            { $match: { proposal_id } },
            { $group: { _id: '$option_id', count: { $sum: 1 } } },
        ]).toArray();
    },
    async hasVote(proposal_id: number, wallet: string) { return votes.findOne({ proposal_id, wallet }); },
    async addVote(proposal_id: number, wallet: string, option_id: number) { await votes.updateOne({ proposal_id, wallet }, { $setOnInsert: { proposal_id, wallet, option_id, voted_at: new Date() } }, { upsert: true }); },
    async playerStats(wallet: string) {
        const rows = await runs.find({ wallet }).toArray();
        return {
            total_runs: rows.length,
            best_distance: rows.reduce((max, r) => Math.max(max, r.distance), 0),
            lifetime_distance: rows.reduce((sum, r) => sum + r.distance, 0),
            total_score: rows.reduce((sum, r) => sum + r.score, 0),
            best_score: rows.reduce((max, r) => Math.max(max, r.score), 0),
            total_jeets_dodged: rows.reduce((sum, r) => sum + r.jeets_dodged, 0),
            total_snipers_survived: rows.reduce((sum, r) => sum + r.snipers_survived, 0),
            total_mev_avoided: rows.reduce((sum, r) => sum + r.mev_avoided, 0),
            valid_runs: rows.filter((r) => !r.suspicious).length,
        };
    },
    async achievementStats(wallet: string) {
        const rows = (await runs.find({ wallet, game_mode: 'ranked' }).toArray()).filter((r) => !r.suspicious);
        return {
            total_runs: rows.length,
            ranked_runs: rows.filter((r) => r.game_mode === 'ranked' && !r.suspicious).length,
            best_distance: rows.reduce((max, r) => Math.max(max, r.distance), 0),
            lifetime_distance: rows.reduce((sum, r) => sum + r.distance, 0),
            max_jeets_dodged: rows.reduce((max, r) => Math.max(max, r.jeets_dodged), 0),
            total_jeets_dodged: rows.reduce((sum, r) => sum + r.jeets_dodged, 0),
            clean_runs: rows.filter((r) => !r.suspicious && r.damage_taken === 0).length,
        };
    },
    async leaderboard(period: 'alltime' | 'daily' | 'weekly', squad: string | undefined, limit: number) {
        const now = Date.now();
        const since = period === 'daily' ? new Date(Math.floor(now / 86400000) * 86400000) : period === 'weekly' ? new Date(Math.floor(now / 604800000) * 604800000) : undefined;
        const match: Record<string, unknown> = { suspicious: false, game_mode: 'ranked' };
        if (since) match.created_at = { $gte: since };
        if (squad) match.referrer = squad;
        const weeklyMin = Math.max(1, Number(process.env.WEEKLY_MIN_RANKED_GAMES || 1));
        const pipeline: Record<string, unknown>[] = [{ $match: match }];
        if (period === 'weekly') {
            pipeline.push(
                { $sort: { wallet: 1, distance: -1, score: -1, created_at: 1, id: 1 } },
                { $group: { _id: '$wallet', games: { $sum: 1 }, run: { $first: '$$ROOT' } } },
                { $match: { games: { $gte: weeklyMin } } },
                { $replaceRoot: { newRoot: '$run' } },
            );
        } else {
            pipeline.push(
                { $sort: { distance: -1, score: -1, created_at: 1, id: 1 } },
                { $group: { _id: '$wallet', run: { $first: '$$ROOT' } } },
                { $replaceRoot: { newRoot: '$run' } },
            );
        }
        pipeline.push({ $sort: { distance: -1, score: -1, created_at: 1, wallet: 1 } }, { $limit: limit });
        const best = await runs.aggregate<RunDoc & { _id: string }>(pipeline).toArray();
        const walletSet = best.map((r) => r.wallet);
        const named = await players.find({ wallet: { $in: walletSet } }).toArray();
        const names = new Map(named.map((p) => [p.wallet, p.name]));
        return best.map((r, index) => ({ position: index + 1, wallet: r.wallet, name: names.get(r.wallet) || r.name, distance: r.distance, rank: r.rank }));
    },
    async weeklyEligibility(week: number, limit = 100) {
        const start = new Date(week * 604800000);
        const end = new Date((week + 1) * 604800000);
        const minimum = Math.max(1, Number(process.env.WEEKLY_MIN_RANKED_GAMES || 1));
        const rows = await runs.aggregate<{ _id: string; games: number; bestRun: RunDoc }>([
            { $match: { game_mode: 'ranked', suspicious: false, created_at: { $gte: start, $lt: end } } },
            { $sort: { wallet: 1, distance: -1, score: -1, created_at: 1, id: 1 } },
            { $group: { _id: '$wallet', games: { $sum: 1 }, bestRun: { $first: '$$ROOT' } } },
            { $match: { games: { $gte: minimum } } },
            { $sort: { 'bestRun.distance': -1, 'bestRun.score': -1, 'bestRun.created_at': 1, _id: 1 } },
            { $limit: limit },
        ]).toArray();
        const wallets = rows.map((r) => r._id);
        const named = await players.find({ wallet: { $in: wallets } }).toArray();
        const names = new Map(named.map((p) => [p.wallet, p.name]));
        return rows.map((r, index) => ({ week, position: index + 1, wallet: r._id, name: names.get(r._id) || shortWallet(r._id), games: r.games, distance: r.bestRun.distance, score: r.bestRun.score }));
    },
};
