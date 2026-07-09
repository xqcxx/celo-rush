import { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { setPlayerName } from '../api';

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
    const playerName = useGameStore((s) => s.playerName);
    const setStoredPlayerName = useGameStore((s) => s.setPlayerName);
    const [stats, setStats] = useState<PlayerStats | null>(null);
    const [name, setName] = useState(playerName || '');
    const [saving, setSaving] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);
    const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

    useEffect(() => {
        setName(playerName || '');
    }, [playerName]);

    useEffect(() => {
        if (!BASE || !walletAddress) return;
        fetch(`${BASE}/api/players/${walletAddress.toLowerCase()}/stats`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => d && setStats(d as PlayerStats))
            .catch(() => {});
    }, [BASE, walletAddress]);

    if (!walletAddress || !isRegistered || !stats) return null;

    const saveName = async () => {
        if (!walletAddress || saving) return;
        setSaving(true);
        setNameError(null);
        try {
            const profile = await setPlayerName(walletAddress, name);
            setStoredPlayerName(profile.name);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'name_failed';
            setNameError(message === 'name_taken' ? 'NAME ALREADY TAKEN' : 'USE 3-16 LETTERS, NUMBERS, SPACES, _ OR -');
        } finally {
            setSaving(false);
        }
    };

    return (
        <details className="panel menu-panel profile-panel">
            <summary className="panel-summary">PROFILE</summary>
            <div className="profile-wallet">
                {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
            </div>
            <div className="profile-name-row">
                <input
                    className="profile-name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/\s+/g, ' ').slice(0, 16))}
                    placeholder="Set player name"
                    maxLength={16}
                    autoComplete="off"
                    spellCheck={false}
                />
                <button className="btn ghost profile-save" onClick={saveName} disabled={saving || name.trim() === (playerName || '')}>
                    {saving ? 'SAVING' : 'SAVE'}
                </button>
            </div>
            {nameError && <div className="register-error">{nameError}</div>}
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
        </details>
    );
}
