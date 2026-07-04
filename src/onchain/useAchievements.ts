import { useCallback, useEffect, useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { getChainId } from '../wallet/provider';

const ARCADE_ITEMS_ABI = [
    {
        type: 'function',
        name: 'mintAchievementBadge',
        inputs: [
            { name: 'badgeId', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

export const ARCADE_ITEMS_ADDRESS = (import.meta.env.VITE_ARCADE_ITEMS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export interface Achievement {
    id: number;
    name: string;
    description: string;
}

interface BadgeVoucher {
    player: string;
    badgeId: number;
    deadline: number;
    signature: string;
}

export function useAchievements(walletAddress: string | null) {
    const [earned, setEarned] = useState<number[]>([]);
    const [claimable, setClaimable] = useState<number[]>([]);
    const [definitions, setDefinitions] = useState<Achievement[]>([]);
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash: txHash });

    const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

    const fetchAchievements = useCallback(async () => {
        if (!BASE || !walletAddress) return;
        try {
            const [r1, r2] = await Promise.all([
                fetch(`${BASE}/api/achievements/${walletAddress.toLowerCase()}`),
                fetch(`${BASE}/api/achievements`),
            ]);
            if (r1.ok) {
                const d = await r1.json() as { earned: number[]; claimable: number[] };
                setEarned(d.earned);
                setClaimable(d.claimable);
            }
            if (r2.ok) {
                setDefinitions(await r2.json() as Achievement[]);
            }
        } catch { /* silent */ }
    }, [BASE, walletAddress]);

    useEffect(() => { fetchAchievements(); }, [fetchAchievements]);

    const claimBadge = useCallback(async (badgeId: number) => {
        if (!BASE || !walletAddress) return;
        const r = await fetch(`${BASE}/api/achievements/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: walletAddress, badgeId }),
        });
        if (!r.ok) return;
        const voucher = await r.json() as BadgeVoucher;
        writeContract({
            address: ARCADE_ITEMS_ADDRESS,
            abi: ARCADE_ITEMS_ABI,
            functionName: 'mintAchievementBadge',
            args: [BigInt(voucher.badgeId), BigInt(voucher.deadline), voucher.signature as `0x${string}`],
            chainId,
        });
    }, [BASE, walletAddress, writeContract, chainId]);

    const getName = (id: number) => definitions.find((d) => d.id === id)?.name || `Badge #${id}`;
    const getDesc = (id: number) => definitions.find((d) => d.id === id)?.description || '';

    return {
        earned,
        claimable,
        definitions,
        claimBadge,
        isPending,
        isConfirming,
        isSuccess,
        isError,
        refetch: fetchAchievements,
        getName,
        getDesc,
    };
}
