import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

interface PlayerStats {
    total_runs: number;
    best_distance: number;
    lifetime_distance: number;
    total_score: number;
    best_score: number;
    total_jeets_dodged: number;
    valid_runs: number;
}

export function ProfilePanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const [stats, setStats] = useState<PlayerStats | null>(null);
    const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

    useEffect(() => {
        if (!BASE || !walletAddress) return;
        fetch(`${BASE}/api/players/${walletAddress.toLowerCase()}/stats`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => d && setStats(d as PlayerStats))
            .catch(() => {});
    }, [BASE, walletAddress]);

    if (!walletAddress || !isRegistered || !stats) return null;

    return (
        <div className="panel profile-panel">
            <div className="kicker">PROFILE</div>
            <div className="profile-wallet">
                {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
            </div>
            <div className="profile-stats">
                <div className="pstat">
                    <span>{stats.total_runs}</span>
                    <small>Runs</small>
                </div>
                <div className="pstat">
                    <span>{stats.best_distance.toLocaleString()}m</span>
                    <small>Best</small>
                </div>
                <div className="pstat">
                    <span>{stats.lifetime_distance.toLocaleString()}m</span>
                    <small>Total</small>
                </div>
                <div className="pstat">
                    <span>{stats.total_jeets_dodged}</span>
                    <small>Dodged</small>
                </div>
            </div>
        </div>
    );
}
