import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { getWeeklyHistory, type WeeklyHistoryEntry } from '../api';
import { formatCusd, useEscrowBalance, useWeeklyReward, WEEKLY_REWARDS_ADDRESS } from '../onchain/useWeeklyRewards';

export function WeeklyRewardsPanel() {
    const wallet = useGameStore((s) => s.walletAddress);
    const [history, setHistory] = useState<WeeklyHistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const reward = useWeeklyReward(wallet);
    const escrow = useEscrowBalance();

    const loadHistory = useCallback(async () => {
        if (!wallet) return;
        setLoading(true);
        setHistory(await getWeeklyHistory(wallet));
        setLoading(false);
    }, [wallet]);

    useEffect(() => { void loadHistory(); }, [loadHistory]);

    if (!wallet) return null;
    if (WEEKLY_REWARDS_ADDRESS === '0x0000000000000000000000000000000000000000') {
        return <details className="panel menu-panel weekly-rewards-panel" open><summary className="panel-summary">WEEKLY REWARDS</summary><p className="register-error">WEEKLY ESCROW IS NOT DEPLOYED FOR THIS NETWORK.</p></details>;
    }

    const winningWeeks = history.filter((entry) => entry.position === 1);
    const request = async (week: number) => {
        try {
            await reward.request(week);
            window.setTimeout(() => { void loadHistory(); }, 1500);
        } catch { /* hook exposes the actionable error */ }
    };
    const withdraw = (week: number) => {
        reward.withdraw(week);
        window.setTimeout(() => { void loadHistory(); }, 1500);
    };

    return <details className="panel menu-panel weekly-rewards-panel" open>
        <summary className="panel-summary">HISTORICAL WEEKLY REWARDS</summary>
        <p className="sub">Only the verified #1 player from a completed UTC week can request that week’s reward. New weeks become requestable after they close.</p>
        {loading && <p className="sub">Loading reward history…</p>}
        {!loading && winningWeeks.length === 0 && <p className="sub">No completed weekly wins yet. Keep charging—the first reward becomes available after this UTC week closes.</p>}
        {winningWeeks.map((entry) => {
            const amount = BigInt(entry.approvedAmount || '0');
            const escrowBalance = escrow.data as bigint | undefined;
            const underfunded = amount > 0n && escrowBalance !== undefined && escrowBalance < amount;
            return <div className="weekly-reward-row" key={entry.week}>
                <div className="weekly-reward-meta">
                    <strong>WEEK {entry.week}</strong>
                    <small>#{entry.position} · {entry.games} RANKED RUNS · {entry.distance.toLocaleString()} m</small>
                </div>
                {entry.withdrawn ? (
                    <span className="checkin-done weekly-status">WITHDRAWN · {formatCusd(amount)} cUSD</span>
                ) : amount > 0n && underfunded ? (
                    <span className="weekly-status register-error">ESCROW UNDERFUNDED · REFILL REQUIRED</span>
                ) : amount > 0n ? (
                    <button className="btn primary" onClick={() => withdraw(entry.week)} disabled={reward.isPending || reward.isConfirming}>
                        {reward.isPending || reward.isConfirming ? 'WITHDRAWING...' : `WITHDRAW ${formatCusd(amount)} cUSD`}
                    </button>
                ) : entry.requested ? (
                    <span className="weekly-status">REQUEST PENDING ADMIN APPROVAL</span>
                ) : entry.canRequest ? (
                    <button className="btn primary" onClick={() => { void request(entry.week); }} disabled={reward.isPending || reward.isConfirming}>
                        {reward.isPending || reward.isConfirming ? 'REQUESTING...' : 'REQUEST REWARD'}
                    </button>
                ) : (
                    <span className="weekly-status">NOT CURRENTLY REQUESTABLE</span>
                )}
            </div>;
        })}
        {reward.error && <div className="register-error">WEEKLY REWARD REQUEST FAILED: {reward.error.message}</div>}
        <p className="sub">The deployer approves each requested amount. Keep the escrow funded before withdrawing.</p>
    </details>;
}
