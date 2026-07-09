import { useEffect, useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useGameStore } from '../store';
import { getChainId } from '../wallet/provider';
import { SHOP_ITEMS } from '../api';
import { rush, useRushApproval } from '../onchain/useRushApproval';
import { ARCADE_ITEMS_ABI, ARCADE_ITEMS_ADDRESS, useArcadeInventory } from '../onchain/useArcadeInventory';

const CAPSULE_COST = 25; // RUSH

interface CapsuleVoucher {
    itemId: number;
    price: string;
    nonce: number;
    deadline: number;
    signature: string;
}

export function CapsulePanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const setCosmeticLevels = useGameStore((s) => s.setCosmeticLevels);
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
    const [opening, setOpening] = useState(false);
    const [openedItem, setOpenedItem] = useState<string | null>(null);
    const [openError, setOpenError] = useState<string | null>(null);
    const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
    const approval = useRushApproval(walletAddress, ARCADE_ITEMS_ADDRESS, rush(10_000));
    const inventory = useArcadeInventory(walletAddress, setCosmeticLevels);
    const refetchInventory = inventory.refetch;

    useEffect(() => {
        if (isSuccess) {
            setOpening(false);
            void refetchInventory();
        }
    }, [isSuccess, refetchInventory]);

    const openCapsule = async () => {
        if (!BASE || !walletAddress) return;
        setOpening(true);
        setOpenedItem(null);
        setOpenError(null);
        if (!approval.hasAllowance) {
            approval.approve();
            setOpening(false);
            return;
        }
        const r = await fetch(`${BASE}/api/capsules/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: walletAddress }),
        });
        if (!r.ok) {
            const d = await r.json().catch(() => null) as { error?: string } | null;
            setOpenError(d?.error || 'CAPSULE VOUCHER FAILED');
            setOpening(false);
            return;
        }
        const voucher = await r.json() as CapsuleVoucher;

        const item = SHOP_ITEMS.find((s) => s.id === voucher.itemId);
        setOpenedItem(item?.name || `Item #${voucher.itemId}`);

        writeContract({
            address: ARCADE_ITEMS_ADDRESS,
            abi: ARCADE_ITEMS_ABI,
            functionName: 'openCapsule',
            args: [BigInt(voucher.itemId), BigInt(voucher.price), BigInt(voucher.nonce), BigInt(voucher.deadline), voucher.signature as `0x${string}`],
            chainId,
        });
    };

    if (!walletAddress || !isRegistered) return null;

    return (
        <details className="panel menu-panel capsule-panel">
            <summary className="panel-summary">LOOT CAPSULES</summary>
            <p className="sub">Open a capsule for a random cosmetic. Costs {CAPSULE_COST} RUSH.</p>

            {isSuccess && openedItem && (
                <div className="capsule-result">
                    <span className="capsule-reveal">★</span>
                    <span>{openedItem}</span>
                </div>
            )}

            {opening && !isSuccess && (
                <div className="register-status">
                    {isPending ? 'CONFIRM IN WALLET...' : isConfirming ? 'OPENING...' : 'ROLLING...'}
                </div>
            )}
            {(openError || error) && <div className="register-error">{openError || 'CAPSULE TRANSACTION FAILED'}</div>}

            <button
                className="btn primary"
                onClick={openCapsule}
                disabled={opening}
                style={{ fontSize: '14px', padding: '12px' }}
            >
                {approval.isPending || approval.isConfirming ? 'APPROVING...' : opening ? '...' : approval.hasAllowance ? `OPEN CAPSULE · ${CAPSULE_COST} RUSH` : 'APPROVE RUSH'}
            </button>
            <div className="item-state-row capsule-owned-row">
                {SHOP_ITEMS.map((item) => (
                    <span key={item.id}>{item.name}: {inventory.balances[item.id]?.toString() ?? '0'}</span>
                ))}
            </div>
        </details>
    );
}
