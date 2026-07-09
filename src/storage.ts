export interface ScoreEntry {
    id: string;
    name: string;
    distance: number;
    score: number;
    rank: string;
    at: number;
}

const KEY = 'bullrush_scores';
const NAME = 'bullrush_name';
const REF = 'bullrush_ref';
const INTRO = 'bullrush_intro_seen';
const MUSIC = 'bullrush_music_mode';
const SKIN = 'bullrush_equipped_skin';
const TRAIL = 'bullrush_equipped_trail';

function safe<T>(fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

export const storage = {
    scores(): ScoreEntry[] {
        const raw = safe(() => localStorage.getItem(KEY), null);
        if (!raw) return [];
        return safe(() => JSON.parse(raw) as ScoreEntry[], []);
    },
    add(entry: Omit<ScoreEntry, 'id'>): ScoreEntry {
        const full: ScoreEntry = { ...entry, id: `${entry.at}-${Math.floor(Math.random() * 1e6).toString(36)}` };
        const all = [...this.scores(), full].sort((a, b) => b.distance - a.distance).slice(0, 50);
        safe(() => localStorage.setItem(KEY, JSON.stringify(all)), undefined);
        return full;
    },
    rename(id: string, name: string): void {
        const all = this.scores().map((s) => (s.id === id ? { ...s, name } : s));
        safe(() => localStorage.setItem(KEY, JSON.stringify(all)), undefined);
    },
    name(): string {
        return safe(() => localStorage.getItem(NAME), null) ?? '';
    },
    setName(n: string): void {
        safe(() => localStorage.setItem(NAME, n), undefined);
    },
    ref(): string {
        return safe(() => localStorage.getItem(REF), null) ?? '';
    },
    introSeen(): boolean {
        return safe(() => localStorage.getItem(INTRO), null) === 'true';
    },
    setIntroSeen(): void {
        safe(() => localStorage.setItem(INTRO, 'true'), undefined);
    },
    musicMode(): number {
        const v = safe(() => localStorage.getItem(MUSIC), null);
        return v === null ? -1 : Number(v);
    },
    setMusicMode(i: number): void {
        safe(() => localStorage.setItem(MUSIC, String(i)), undefined);
    },
    equippedSkin(): number | null {
        const raw = safe(() => localStorage.getItem(SKIN), null);
        const id = raw ? Number(raw) : 0;
        return Number.isFinite(id) && id > 0 ? id : null;
    },
    setEquippedSkin(id: number | null): void {
        safe(() => id ? localStorage.setItem(SKIN, String(id)) : localStorage.removeItem(SKIN), undefined);
    },
    equippedTrail(): number | null {
        const raw = safe(() => localStorage.getItem(TRAIL), null);
        const id = raw ? Number(raw) : 0;
        return Number.isFinite(id) && id > 0 ? id : null;
    },
    setEquippedTrail(id: number | null): void {
        safe(() => id ? localStorage.setItem(TRAIL, String(id)) : localStorage.removeItem(TRAIL), undefined);
    },
    captureRef(): void {
        const raw = safe(() => new URLSearchParams(window.location.search).get('r'), null);
        if (!raw) return;
        // Sanitize hard: a ref code is an opaque handle, never markup. Strip to a
        // safe charset + length cap before it's stored or sent to the API.
        const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
        if (clean) safe(() => localStorage.setItem(REF, clean), undefined);
    },
};
