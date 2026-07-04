import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useCallback } from 'react';
import { getChainId } from '../wallet/provider';
import type { RewardVoucher } from '../api';

const RUN_REWARDS_ABI = [
    {
        type: 'function',
        name: 'claimRunReward',
        inputs: [
            { name: 'runId', type: 'bytes32' },
            { name: 'score', type: 'uint256' },
            { name: 'rewardAmount', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

export const RUN_REWARDS_ADDRESS = (import.meta.env.VITE_RUN_REWARDS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export function useClaimReward() {
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash: txHash });

    const claimReward = useCallback((voucher: RewardVoucher) => {
        writeContract({
            address: RUN_REWARDS_ADDRESS,
            abi: RUN_REWARDS_ABI,
            functionName: 'claimRunReward',
            args: [
                voucher.runId as `0x${string}`,
                BigInt(voucher.score),
                BigInt(voucher.rewardAmount),
                BigInt(voucher.deadline),
                voucher.signature as `0x${string}`,
            ],
            chainId,
        });
    }, [writeContract, chainId]);

    return {
        claimReward,
        isPending,
        isConfirming,
        isSuccess,
        isError,
        txHash,
    };
}
