import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SHOP_ITEMS } from '../api';
import { getChainId } from '../wallet/provider';
import { useGameStore } from '../store';

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

export function ShopPanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });
    const [buyingId, setBuyingId] = useState<number | null>(null);

    const buy = (itemId: number) => {
        setBuyingId(itemId);
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
        <div className="panel shop-panel">
            <div className="kicker">COSMETIC SHOP</div>
            <div className="shop-grid">
                {SHOP_ITEMS.map((item) => (
                    <div key={item.id} className="shop-item">
                        <div className="shop-item-header">
                            <span className="shop-item-name">{item.name}</span>
                            <span className="shop-item-cat">{item.category}</span>
                        </div>
                        <p className="shop-item-desc">{item.description}</p>
                        <div className="shop-item-footer">
                            <span className="shop-item-price">{item.priceRush} RUSH</span>
                            <button
                                className="btn wallet-btn"
                                onClick={() => buy(item.id)}
                                disabled={isPending && buyingId === item.id}
                                style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }}
                            >
                                {isPending && buyingId === item.id ? (isConfirming ? 'CONFIRMING...' : 'SIGNING...') : 'BUY'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
