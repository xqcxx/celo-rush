import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import { useCallback } from 'react';
import { getChainId } from '../wallet/provider';

const ERC20_ABI = [
    {
        type: 'function',
        name: 'allowance',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'approve',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
        stateMutability: 'nonpayable',
    },
] as const;

export const RUSH_TOKEN_ADDRESS = (import.meta.env.VITE_GAMETOKEN_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export function rush(amount: number): bigint {
    return parseUnits(String(amount), 18);
}

export function useRushApproval(owner: string | null | undefined, spender: `0x${string}`, amount: bigint) {
    const chainId = getChainId();
    const { data: allowance, refetch } = useReadContract({
        address: RUSH_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: owner ? [owner as `0x${string}`, spender] : undefined,
        chainId,
        query: { enabled: !!owner && amount > 0n },
    });
    const { writeContract, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const hasAllowance = typeof allowance === 'bigint' && allowance >= amount;

    const approve = useCallback(() => {
        writeContract({
            address: RUSH_TOKEN_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, amount],
            chainId,
        });
    }, [writeContract, spender, amount, chainId]);

    return { allowance, hasAllowance, approve, isPending, isConfirming, isSuccess, refetch };
}
