import { useEffect, useState } from 'react';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useGameStore } from '../store';
import { getChainId } from '../wallet/provider';
import { rush, useRushApproval } from '../onchain/useRushApproval';

const SEASON_MANAGER_ABI = [
    { type: 'function', name: 'enterSeason', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

const SEASON_MANAGER_ADDRESS = (import.meta.env.VITE_SEASON_MANAGER_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

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
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
    const approval = useRushApproval(walletAddress, SEASON_MANAGER_ADDRESS, rush(10_000));

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

    useEffect(() => {
        if (!isSuccess || !BASE || !walletAddress || !season) return;
        fetch(`${BASE}/api/seasons/enter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: walletAddress, seasonId: season.id }),
        }).then((r) => { if (r.ok) setEntered(true); }).catch(() => {});
    }, [isSuccess, BASE, walletAddress, season]);

    const enter = async () => {
        if (!walletAddress || !season) return;
        if (!approval.hasAllowance) {
            approval.approve();
            return;
        }
        writeContract({
            address: SEASON_MANAGER_ADDRESS,
            abi: SEASON_MANAGER_ABI,
            functionName: 'enterSeason',
            args: [BigInt(season.id)],
            chainId,
        });
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
                    {approval.isPending || approval.isConfirming ? 'APPROVING...' : isPending ? 'SIGNING...' : isConfirming ? 'ENTERING...' : approval.hasAllowance ? 'ENTER SEASON · 10 RUSH' : 'APPROVE RUSH'}
                </button>
            )}
        </div>
    );
}
