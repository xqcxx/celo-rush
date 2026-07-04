import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

// Pooled per instance (cap so horizontal replicas can't exhaust Postgres).
// SSL on for public connections (local dev / proxy); off on Railway private net.
export const sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: process.env.DATABASE_SSL === 'true' ? 'require' : false,
});

export async function initSchema(): Promise<void> {
    await sql`
        CREATE TABLE IF NOT EXISTS runs (
            id          uuid PRIMARY KEY,
            name        text NOT NULL,
            distance    integer NOT NULL,
            score       integer NOT NULL,
            rank        text NOT NULL,
            death_cause text,
            jeets_dodged integer DEFAULT 0,
            snipers_survived integer DEFAULT 0,
            mev_avoided integer DEFAULT 0,
            max_combo   integer DEFAULT 0,
            duration_ms integer DEFAULT 0,
            wallet      text,
            run_id      text,
            game_mode   text DEFAULT 'casual',
            reward_claimed boolean DEFAULT false,
            referrer    text,
            suspicious  boolean DEFAULT false,
            created_at  timestamptz DEFAULT now()
        )
    `;
    await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS run_id text`;
    await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS game_mode text DEFAULT 'casual'`;
    await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS reward_claimed boolean DEFAULT false`;
    await sql`
        CREATE TABLE IF NOT EXISTS players (
            wallet      text PRIMARY KEY,
            registered_at timestamptz DEFAULT now()
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS runs_distance_idx ON runs (distance DESC)`;
    await sql`
        CREATE TABLE IF NOT EXISTS achievement_claims (
            wallet      text NOT NULL,
            badge_id    integer NOT NULL,
            claimed_at  timestamptz DEFAULT now(),
            PRIMARY KEY (wallet, badge_id)
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS runs_distance_idx ON runs (distance DESC)`;
    await sql`
        CREATE TABLE IF NOT EXISTS seasons (
            id          integer PRIMARY KEY,
            start_time  timestamptz NOT NULL,
            end_time    timestamptz NOT NULL,
            finalized   boolean DEFAULT false
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS season_entries (
            season_id   integer NOT NULL,
            wallet      text NOT NULL,
            entered_at  timestamptz DEFAULT now(),
            PRIMARY KEY (season_id, wallet)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS proposals (
            id          integer PRIMARY KEY,
            season_id   integer NOT NULL,
            description text NOT NULL,
            options     text[] NOT NULL,
            end_time    timestamptz NOT NULL
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS votes (
            proposal_id integer NOT NULL,
            wallet      text NOT NULL,
            option_id   integer NOT NULL,
            voted_at    timestamptz DEFAULT now(),
            PRIMARY KEY (proposal_id, wallet)
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS runs_distance_idx ON runs (distance DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS runs_created_idx ON runs (created_at DESC)`;
}
