import { useEffect } from 'react';
import { useReadContracts } from 'wagmi';
import { SHOP_ITEMS } from '../api';
import { getChainId } from '../wallet/provider';

export const ARCADE_ITEMS_ADDRESS = (import.meta.env.VITE_ARCADE_ITEMS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const ARCADE_ITEMS_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [
            { name: 'account', type: 'address' },
            { name: 'id', type: 'uint256' },
        ],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'itemLevel',
        inputs: [
            { name: 'player', type: 'address' },
            { name: 'itemId', type: 'uint256' },
        ],
        outputs: [{ type: 'uint8' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'buyItem',
        inputs: [{ name: 'itemId', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'upgradeItem',
        inputs: [{ name: 'itemId', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'openCapsule',
        inputs: [
            { name: 'itemId', type: 'uint256' },
            { name: 'price', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

export function useArcadeInventory(walletAddress: string | null | undefined, onLevels?: (levels: Record<number, number>) => void) {
    const chainId = getChainId();
    const enabled = !!walletAddress;
    const contracts = SHOP_ITEMS.flatMap((item) => [
        {
            address: ARCADE_ITEMS_ADDRESS,
            abi: ARCADE_ITEMS_ABI,
            functionName: 'balanceOf',
            args: [walletAddress as `0x${string}`, BigInt(item.id)],
            chainId,
        },
        {
            address: ARCADE_ITEMS_ADDRESS,
            abi: ARCADE_ITEMS_ABI,
            functionName: 'itemLevel',
            args: [walletAddress as `0x${string}`, BigInt(item.id)],
            chainId,
        },
    ] as const);

    const { data, refetch, isLoading } = useReadContracts({
        contracts,
        query: { enabled },
    });

    const balances: Record<number, bigint> = {};
    const levels: Record<number, number> = {};
    SHOP_ITEMS.forEach((item, index) => {
        const balance = data?.[index * 2]?.result;
        const level = data?.[index * 2 + 1]?.result;
        balances[item.id] = typeof balance === 'bigint' ? balance : 0n;
        levels[item.id] = typeof level === 'bigint' ? Number(level) : typeof level === 'number' ? level : 0;
    });

    useEffect(() => {
        if (data && onLevels) onLevels(levels);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, onLevels]);

    return {
        balances,
        levels,
        isLoading,
        refetch,
        owns: (itemId: number) => (balances[itemId] ?? 0n) > 0n,
        levelOf: (itemId: number) => levels[itemId] ?? 0,
    };
}
