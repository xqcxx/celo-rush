import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useGameStore } from '../store';
import { getChainId } from '../wallet/provider';
import { SHOP_ITEMS } from '../api';

const ARCADE_ITEMS_ABI = [
    {
        type: 'function',
        name: 'buyItem',
        inputs: [{ name: 'itemId', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

export const ARCADE_ITEMS_ADDRESS = (import.meta.env.VITE_ARCADE_ITEMS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

const CAPSULE_COST = 25; // RUSH

export function CapsulePanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
    const [opening, setOpening] = useState(false);
    const [openedItem, setOpenedItem] = useState<string | null>(null);
    const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

    const openCapsule = async () => {
        if (!BASE || !walletAddress) return;
        setOpening(true);
        setOpenedItem(null);
        const r = await fetch(`${BASE}/api/capsules/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: walletAddress }),
        });
        if (!r.ok) { setOpening(false); return; }
        const { itemId } = await r.json() as { itemId: number };

        const item = SHOP_ITEMS.find((s) => s.id === itemId);
        setOpenedItem(item?.name || `Item #${itemId}`);

        writeContract({
            address: ARCADE_ITEMS_ADDRESS,
            abi: ARCADE_ITEMS_ABI,
            functionName: 'buyItem',
            args: [BigInt(itemId)],
            chainId,
        });
    };

    if (!walletAddress || !isRegistered) return null;

    return (
        <div className="panel capsule-panel">
            <div className="kicker">LOOT CAPSULES</div>
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

            <button
                className="btn primary"
                onClick={openCapsule}
                disabled={opening}
                style={{ fontSize: '14px', padding: '12px' }}
            >
                {opening ? '...' : `OPEN CAPSULE · ${CAPSULE_COST} RUSH`}
            </button>
        </div>
    );
}
