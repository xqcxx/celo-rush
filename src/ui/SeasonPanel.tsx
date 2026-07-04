import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

interface SeasonData {
    id: number;
    start_time: string;
    end_time: string;
    finalized: boolean;
}

export function SeasonPanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const [season, setSeason] = useState<SeasonData | null>(null);
    const [entered, setEntered] = useState(false);
    const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

    useEffect(() => {
        if (!BASE || !walletAddress) return;
        (async () => {
            const r = await fetch(`${BASE}/api/seasons/current`);
            if (r.ok) {
                const d = await r.json() as { season: SeasonData | null };
                setSeason(d.season);
                if (d.season) {
                    const r2 = await fetch(`${BASE}/api/seasons/${d.season.id}/hasEntered/${walletAddress}`);
                    if (r2.ok) {
                        const d2 = await r2.json() as { entered: boolean };
                        setEntered(d2.entered);
                    }
                }
            }
        })();
    }, [BASE, walletAddress]);

    const enter = async () => {
        if (!BASE || !walletAddress || !season) return;
        const r = await fetch(`${BASE}/api/seasons/enter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: walletAddress, seasonId: season.id }),
        });
        if (r.ok) setEntered(true);
    };

    if (!walletAddress || !isRegistered || !season) return null;

    const endsIn = new Date(season.end_time).getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(endsIn / 86400000));

    return (
        <div className="panel season-panel">
            <div className="kicker">SEASON {season.id}</div>
            <p className="sub">{daysLeft}d remaining</p>
            {entered ? (
                <div className="checkin-done" style={{ width: '100%' }}>
                    <span className="checkin-streak">ENTERED</span>
                </div>
            ) : (
                <button className="btn primary" onClick={enter} style={{ fontSize: '14px', padding: '12px' }}>
                    ENTER SEASON · 10 RUSH
                </button>
            )}
        </div>
    );
}
