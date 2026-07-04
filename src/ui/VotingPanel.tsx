import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

interface Proposal {
    id: number;
    seasonId: number;
    description: string;
    options: string[];
    voteCounts: number[];
    endTime: string;
}

export function VotingPanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [votedMap, setVotedMap] = useState<Record<number, number>>({});
    const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

    useEffect(() => {
        if (!BASE || !walletAddress) return;
        (async () => {
            const r = await fetch(`${BASE}/api/proposals/active`);
            if (r.ok) {
                const ps = await r.json() as Proposal[];
                setProposals(ps);
                for (const p of ps) {
                    const r2 = await fetch(`${BASE}/api/proposals/${p.id}/vote/${walletAddress}`);
                    if (r2.ok) {
                        const d = await r2.json() as { voted: boolean; optionId: number | null };
                        if (d.voted) setVotedMap((m) => ({ ...m, [p.id]: d.optionId! }));
                    }
                }
            }
        })();
    }, [BASE, walletAddress]);

    const vote = async (proposalId: number, optionId: number) => {
        if (!BASE || !walletAddress) return;
        const r = await fetch(`${BASE}/api/proposals/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: walletAddress, proposalId, optionId }),
        });
        if (r.ok) {
            setVotedMap((m) => ({ ...m, [proposalId]: optionId }));
            setProposals((ps) => ps.map((p) => {
                if (p.id === proposalId) {
                    const counts = [...p.voteCounts];
                    counts[optionId] += 1;
                    return { ...p, voteCounts: counts };
                }
                return p;
            }));
        }
    };

    if (!walletAddress || !isRegistered || proposals.length === 0) return null;

    return (
        <div className="panel voting-panel">
            <div className="kicker">COMMUNITY VOTING</div>
            {proposals.map((p) => (
                <div key={p.id} className="vote-card">
                    <strong className="vote-desc">{p.description}</strong>
                    <div className="vote-opts">
                        {p.options.map((opt, i) => {
                            const hasVoted = p.id in votedMap;
                            const isMyVote = votedMap[p.id] === i;
                            const pct = p.voteCounts.reduce((a, b) => a + b, 0) > 0
                                ? Math.round((p.voteCounts[i] / Math.max(1, p.voteCounts.reduce((a, b) => a + b, 0))) * 100)
                                : 0;
                            return (
                                <button
                                    key={i}
                                    className={`vote-opt ${isMyVote ? 'voted' : ''}`}
                                    onClick={() => !hasVoted && vote(p.id, i)}
                                    disabled={hasVoted}
                                >
                                    <span>{opt}</span>
                                    <span className="vote-pct">{pct}%</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
