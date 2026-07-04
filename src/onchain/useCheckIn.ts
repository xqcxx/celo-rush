import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useCallback, useMemo } from 'react';
import { useWallet } from '../wallet/useWallet';
import { getChainId } from '../wallet/provider';

const CHECK_IN_ABI = [
    {
        type: 'function',
        name: 'checkIn',
        inputs: [],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'hasCheckedInToday',
        inputs: [{ name: 'player', type: 'address' }],
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getStreak',
        inputs: [{ name: 'player', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'CheckedIn',
        inputs: [
            { name: 'player', type: 'address', indexed: true },
            { name: 'streak', type: 'uint256' },
            { name: 'day', type: 'uint256' },
        ],
    },
] as const;

const CHECK_IN_ADDRESS = (import.meta.env.VITE_CHECKIN_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export function useCheckIn() {
    const { address, isConnected } = useWallet();
    const chainId = getChainId();

    const { data: hasCheckedIn, refetch: refetchCheckIn } = useReadContract({
        address: CHECK_IN_ADDRESS,
        abi: CHECK_IN_ABI,
        functionName: 'hasCheckedInToday',
        args: address ? [address] : undefined,
        chainId,
        query: { enabled: isConnected && !!address },
    });

    const { data: streak, refetch: refetchStreak } = useReadContract({
        address: CHECK_IN_ADDRESS,
        abi: CHECK_IN_ABI,
        functionName: 'getStreak',
        args: address ? [address] : undefined,
        chainId,
        query: { enabled: isConnected && !!address },
    });

    const { writeContract, data: txHash, isPending } = useWriteContract();

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash: txHash,
    });

    const checkIn = useCallback(() => {
        writeContract({
            address: CHECK_IN_ADDRESS,
            abi: CHECK_IN_ABI,
            functionName: 'checkIn',
            chainId,
        });
    }, [writeContract, chainId]);

    const canCheckIn = useMemo(() => {
        return isConnected && hasCheckedIn === false && !isPending && !isConfirming;
    }, [isConnected, hasCheckedIn, isPending, isConfirming]);

    const streakNum = streak ? Number(streak) : 0;

    return {
        hasCheckedIn: hasCheckedIn === true,
        streak: streakNum,
        canCheckIn,
        isPending,
        isConfirming,
        isSuccess,
        checkIn,
        checkInTxHash: txHash,
        refetch: () => {
            refetchCheckIn();
            refetchStreak();
        },
    };
}
