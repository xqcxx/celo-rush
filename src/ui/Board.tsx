import { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { storage } from '../storage';
import { getLeaderboard, apiEnabled, type LbEntry } from '../api';

type Tab = 'alltime' | 'daily' | 'weekly';

export function Board() {
    const enterGate = useGameStore((s) => s.enterGate);
    const reset = useGameStore((s) => s.reset);
    const [tab, setTab] = useState<Tab>('alltime');
    const [rows, setRows] = useState<LbEntry[]>([]);
    const [loading, setLoading] = useState(apiEnabled);
    const [global, setGlobal] = useState(false);

    useEffect(() => {
        let alive = true;
        setLoading(apiEnabled);
        (async () => {
            const remote = await getLeaderboard(tab);
            if (!alive) return;
            if (remote) {
                setRows(remote);
                setGlobal(true);
            } else {
                setGlobal(false);
                const now = Date.now();
                const start = tab === 'daily'
                    ? Math.floor(now / 86400000) * 86400000
                    : tab === 'weekly'
                        ? Math.floor(now / 604800000) * 604800000
                        : 0;
                setRows(storage.scores()
                    .filter((s) => s.at >= start)
                    .sort((a, b) => b.distance - a.distance || b.score - a.score || a.at - b.at)
                    .slice(0, 12)
                    .map((s, i) => ({ position: i + 1, name: s.name, distance: s.distance, rank: s.rank })));
            }
            setLoading(false);
        })();
        return () => {
            alive = false;
        };
    }, [tab]);

    const tabs: { id: Tab; label: string }[] = [
        { id: 'alltime', label: 'ALL TIME' },
        { id: 'daily', label: 'DAILY' },
        { id: 'weekly', label: 'WEEKLY' },
    ];
    return (
        <div className="overlay">
            <div className="panel board">
                <div className="kicker">BULL BOARD {global ? '· GLOBAL' : '· LOCAL'}</div>
                {apiEnabled && (
                    <div className="tabs">
                        {tabs.map((t) => (
                            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}
                {loading ? (
                    <p className="sub">Loading the trenches…</p>
                ) : rows.length === 0 ? (
                    <p className="sub">No runs yet. Charge first.</p>
                ) : (
                    <ol className="rows">
                        {rows.map((s) => (
                            <li key={`${s.position}-${s.name}-${s.distance}`}>
                                <span className="rk">{s.position}</span>
                                <span className="nm">{s.name}</span>
                                <span className="ds">{s.distance.toLocaleString()} m</span>
                                <span className="rt">{s.rank}</span>
                            </li>
                        ))}
                    </ol>
                )}
                <button className="btn primary" onClick={enterGate}>
                    RUN IT BACK ▸
                </button>
                <button className="btn ghost" onClick={reset}>
                    MENU
                </button>
            </div>
        </div>
    );
}
