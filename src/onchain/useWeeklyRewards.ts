import { useCallback, useEffect } from 'react';
import { useState } from 'react';
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { getChainId } from '../wallet/provider';
import { requestWeeklyReward, syncWeeklyRequest } from '../api';

export const WEEKLY_REWARDS_ADDRESS = (import.meta.env.VITE_WEEKLY_REWARDS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const CUSD_ADDRESS = (import.meta.env.VITE_CUSD_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const WEEKLY_REWARDS_ADMIN = ((import.meta.env.VITE_WEEKLY_REWARDS_ADMIN_ADDRESS || '') as string).toLowerCase();

export const WEEKLY_REWARDS_ABI = [
    { type: 'function', name: 'currentWeek', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'rewards', inputs: [{ name: 'week', type: 'uint256' }, { name: 'player', type: 'address' }], outputs: [{ name: 'requested', type: 'bool' }, { name: 'withdrawn', type: 'bool' }, { name: 'approvedAmount', type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'requestReward', inputs: [{ name: 'week', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'approveReward', inputs: [{ name: 'week', type: 'uint256' }, { name: 'player', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'withdrawReward', inputs: [{ name: 'week', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'fund', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'drain', inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

const ERC20_ABI = [
    { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

export function parseCusd(value: string): bigint {
    const normalized = value.trim();
    if (!/^\d+(\.\d{0,6})?$/.test(normalized)) return 0n;
    try { return parseUnits(normalized || '0', 6); } catch { return 0n; }
}

export function formatCusd(value: bigint | undefined): string {
    return typeof value === 'bigint' ? formatUnits(value, 6) : '0';
}

export function useWeeklyReward(player: string | null) {
    const chainId = getChainId();
    const enabled = !!player && WEEKLY_REWARDS_ADDRESS !== '0x0000000000000000000000000000000000000000';
    const week = useReadContract({ address: WEEKLY_REWARDS_ADDRESS, abi: WEEKLY_REWARDS_ABI, functionName: 'currentWeek', chainId, query: { enabled, refetchInterval: 15_000 } });
    const reward = useReadContract({
        address: WEEKLY_REWARDS_ADDRESS,
        abi: WEEKLY_REWARDS_ABI,
        functionName: 'rewards',
        args: week.data !== undefined && player ? [week.data, player as `0x${string}`] : undefined,
        chainId,
        query: { enabled: enabled && week.data !== undefined, refetchInterval: 15_000 },
    });
    const { writeContract, writeContractAsync, data: hash, isPending, error: writeError } = useWriteContract();
    const receipt = useWaitForTransactionReceipt({ hash });
    const [pendingWeek, setPendingWeek] = useState<number | null>(null);
    const [requestError, setRequestError] = useState<Error | null>(null);
    const request = useCallback(async (requestedWeek: number) => {
        if (!player) throw new Error('wallet_required');
        setRequestError(null);
        try {
            const voucher = await requestWeeklyReward(player, requestedWeek);
            setPendingWeek(requestedWeek);
            await writeContractAsync({
                address: WEEKLY_REWARDS_ADDRESS,
                abi: WEEKLY_REWARDS_ABI,
                functionName: 'requestReward',
                args: [BigInt(voucher.week), BigInt(voucher.deadline), voucher.signature],
                chainId,
            });
        } catch (error) {
            setPendingWeek(null);
            const normalized = error instanceof Error ? error : new Error('weekly_request_failed');
            setRequestError(normalized);
            throw normalized;
        }
    }, [chainId, player, writeContractAsync]);
    const withdraw = useCallback((requestedWeek: number) => writeContract({ address: WEEKLY_REWARDS_ADDRESS, abi: WEEKLY_REWARDS_ABI, functionName: 'withdrawReward', args: [BigInt(requestedWeek)], chainId }), [chainId, writeContract]);
    useEffect(() => {
        if (!receipt.isSuccess || !hash || !player || pendingWeek === null) return;
        let cancelled = false;
        const sync = async () => {
            for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
                try {
                    await syncWeeklyRequest(player, pendingWeek, hash);
                    if (!cancelled) {
                        setPendingWeek(null);
                        void week.refetch();
                        void reward.refetch();
                    }
                    return;
                } catch (error) {
                    if (attempt === 2 && !cancelled) setRequestError(error instanceof Error ? error : new Error('weekly_sync_failed'));
                    await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        };
        void sync();
        return () => { cancelled = true; };
    }, [hash, pendingWeek, player, receipt.isSuccess, reward, week]);
    const details = reward.data as readonly [boolean, boolean, bigint] | undefined;
    return { week: week.data, requested: details?.[0] || false, withdrawn: details?.[1] || false, approvedAmount: details?.[2] || 0n, request, withdraw, isPending, isConfirming: receipt.isLoading, isSuccess: receipt.isSuccess, error: requestError || writeError || (receipt.isError ? new Error('transaction_reverted') : null), refetch: reward.refetch };
}

export function useCusdBalance(owner: string | null) {
    const chainId = getChainId();
    return useReadContract({ address: CUSD_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: owner ? [owner as `0x${string}`] : undefined, chainId, query: { enabled: !!owner && CUSD_ADDRESS !== '0x0000000000000000000000000000000000000000', refetchInterval: 15_000 } });
}

export function useEscrowBalance() {
    const chainId = getChainId();
    return useReadContract({ address: CUSD_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [WEEKLY_REWARDS_ADDRESS], chainId, query: { enabled: CUSD_ADDRESS !== '0x0000000000000000000000000000000000000000', refetchInterval: 15_000 } });
}

export function useCusdAdminActions() {
    const chainId = getChainId();
    const { writeContract, data: hash, isPending } = useWriteContract();
    const receipt = useWaitForTransactionReceipt({ hash });
    const approve = (amount: bigint) => writeContract({ address: CUSD_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [WEEKLY_REWARDS_ADDRESS, amount], chainId });
    const fund = (amount: bigint) => writeContract({ address: WEEKLY_REWARDS_ADDRESS, abi: WEEKLY_REWARDS_ABI, functionName: 'fund', args: [amount], chainId });
    const approveReward = (week: bigint, player: `0x${string}`, amount: bigint) => writeContract({ address: WEEKLY_REWARDS_ADDRESS, abi: WEEKLY_REWARDS_ABI, functionName: 'approveReward', args: [week, player, amount], chainId });
    const drain = (recipient: `0x${string}`, amount: bigint) => writeContract({ address: WEEKLY_REWARDS_ADDRESS, abi: WEEKLY_REWARDS_ABI, functionName: 'drain', args: [recipient, amount], chainId });
    return { approve, fund, approveReward, drain, isPending, isConfirming: receipt.isLoading, isSuccess: receipt.isSuccess };
}
