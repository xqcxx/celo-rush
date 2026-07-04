import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useCallback, useMemo, useState } from 'react';
import { keccak256, toHex } from 'viem';
import { getChainId } from '../wallet/provider';
import { rush, useRushApproval } from './useRushApproval';

const RUN_REWARDS_ABI = [
    {
        type: 'function',
        name: 'startRankedRun',
        inputs: [{ name: 'runId', type: 'bytes32' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'event',
        name: 'RankedRunStarted',
        inputs: [
            { name: 'player', type: 'address', indexed: true },
            { name: 'runId', type: 'bytes32', indexed: true },
            { name: 'freeTicket', type: 'bool' },
        ],
    },
] as const;

export const RUN_REWARDS_ADDRESS = (import.meta.env.VITE_RUN_REWARDS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export function useRankedRun(walletAddress?: string | null) {
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash: txHash });
    const [storedRunId, setStoredRunId] = useState<string | null>(null);
    const approval = useRushApproval(walletAddress, RUN_REWARDS_ADDRESS, rush(10_000));

    const startRankedRun = useCallback(() => {
        if (!approval.hasAllowance) {
            approval.approve();
            return;
        }
        const runIdBytes = keccak256(toHex(Date.now().toString(36) + Math.random().toString(36)));
        setStoredRunId(runIdBytes);
        writeContract({
            address: RUN_REWARDS_ADDRESS,
            abi: RUN_REWARDS_ABI,
            functionName: 'startRankedRun',
            args: [runIdBytes],
            chainId,
        });
    }, [approval, writeContract, chainId]);

    const confirmedRunId = isSuccess ? storedRunId : null;

    return useMemo(() => ({
        startRankedRun,
        isPending,
        isConfirming,
        isSuccess,
        isError,
        txHash,
        runId: confirmedRunId,
        needsApproval: !approval.hasAllowance,
        isApproving: approval.isPending || approval.isConfirming,
    }), [startRankedRun, isPending, isConfirming, isSuccess, isError, txHash, confirmedRunId, approval.hasAllowance, approval.isPending, approval.isConfirming]);
}
