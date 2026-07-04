import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useCallback, useState } from 'react';
import { getChainId } from '../wallet/provider';

const PLAYER_REGISTRY_ABI = [
    {
        type: 'function',
        name: 'register',
        inputs: [],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'isRegistered',
        inputs: [{ name: 'wallet', type: 'address' }],
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
    },
] as const;

export const PLAYER_REGISTRY_ADDRESS = (import.meta.env.VITE_PLAYER_REGISTRY_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export function usePlayerRegistry() {
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash: txHash });
    const [error, setError] = useState<string | null>(null);

    const register = useCallback(() => {
        setError(null);
        try {
            writeContract({
                address: PLAYER_REGISTRY_ADDRESS,
                abi: PLAYER_REGISTRY_ABI,
                functionName: 'register',
                chainId,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Transaction rejected');
        }
    }, [writeContract, chainId]);

    return {
        register,
        isPending,
        isConfirming,
        isSuccess,
        isError,
        error,
        txHash,
    };
}
