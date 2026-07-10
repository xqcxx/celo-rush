import { useCallback, useEffect, useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SHOP_ITEMS } from '../api';
import { getChainId } from '../wallet/provider';
import { useGameStore } from '../store';
import { rush, useRushApproval } from '../onchain/useRushApproval';
import { ARCADE_ITEMS_ABI, ARCADE_ITEMS_ADDRESS, useArcadeInventory } from '../onchain/useArcadeInventory';

export function ShopPanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const equippedSkinId = useGameStore((s) => s.equippedSkinId);
    const equippedTrailId = useGameStore((s) => s.equippedTrailId);
    const equipSkin = useGameStore((s) => s.equipSkin);
    const equipTrail = useGameStore((s) => s.equipTrail);
    const setCosmeticLevels = useGameStore((s) => s.setCosmeticLevels);
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
    const [buyingId, setBuyingId] = useState<number | null>(null);
    const [buyAfterApprovalId, setBuyAfterApprovalId] = useState<number | null>(null);
    const approval = useRushApproval(walletAddress, ARCADE_ITEMS_ADDRESS, rush(10_000));
    const inventory = useArcadeInventory(walletAddress, setCosmeticLevels);
    const refetchInventory = inventory.refetch;

    useEffect(() => {
        if (isSuccess) void refetchInventory();
    }, [isSuccess, refetchInventory]);

    const sendBuy = useCallback((itemId: number) => {
        writeContract({
            address: ARCADE_ITEMS_ADDRESS,
            abi: ARCADE_ITEMS_ABI,
            functionName: 'buyItem',
            args: [BigInt(itemId)],
            chainId,
        });
    }, [writeContract, chainId]);

    useEffect(() => {
        if (!buyAfterApprovalId || !approval.hasAllowance || approval.isPending || approval.isConfirming) return;
        const itemId = buyAfterApprovalId;
        setBuyAfterApprovalId(null);
        setBuyingId(itemId);
        sendBuy(itemId);
    }, [buyAfterApprovalId, approval.hasAllowance, approval.isPending, approval.isConfirming, sendBuy]);

    const buy = (itemId: number) => {
        setBuyingId(itemId);
        if (!approval.hasAllowance) {
            setBuyAfterApprovalId(itemId);
            approval.approve();
            return;
        }
        sendBuy(itemId);
    };

    const equip = (item: (typeof SHOP_ITEMS)[number]) => {
        if (!inventory.owns(item.id)) return;
        if (item.category === 'skin') equipSkin(equippedSkinId === item.id ? null : item.id);
        if (item.category === 'trail') equipTrail(equippedTrailId === item.id ? null : item.id);
    };

    if (!walletAddress || !isRegistered) return null;

    return (
        <details className="panel menu-panel shop-panel">
            <summary className="panel-summary">COSMETIC SHOP</summary>
            <div className="shop-grid">
                {SHOP_ITEMS.map((item) => (
                    <div key={item.id} className="shop-item">
                        <div className="shop-item-header">
                            <span className="shop-item-name">{item.name}</span>
                            <span className="shop-item-cat">{item.category}</span>
                        </div>
                        <p className="shop-item-desc">{item.description}</p>
                        <div className="item-state-row">
                            <span>{inventory.owns(item.id) ? `OWNED x${inventory.balances[item.id].toString()}` : 'NOT OWNED'}</span>
                            <span>LVL {inventory.levelOf(item.id)}/{item.maxLevel}</span>
                        </div>
                        <div className="shop-item-footer">
                            <span className="shop-item-price">{item.priceRush} RUSH</span>
                            {inventory.owns(item.id) && (item.category === 'skin' || item.category === 'trail') && (
                                <button
                                    className="btn wallet-btn"
                                    onClick={() => equip(item)}
                                    style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}
                                >
                                    {equippedSkinId === item.id || equippedTrailId === item.id ? 'UNEQUIP' : 'EQUIP'}
                                </button>
                            )}
                            <button
                                className="btn wallet-btn"
                                onClick={() => buy(item.id)}
                                disabled={isPending && buyingId === item.id}
                                style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }}
                            >
                                {isPending && buyingId === item.id
                                    ? (isConfirming ? 'CONFIRMING...' : 'SIGNING...')
                                    : buyAfterApprovalId === item.id || (buyingId === item.id && !approval.hasAllowance)
                                        ? (approval.isPending || approval.isConfirming ? 'APPROVING...' : 'APPROVE & BUY')
                                        : 'BUY'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {inventory.isLoading && <div className="register-status">LOADING INVENTORY...</div>}
            {error && <div className="register-error">PURCHASE FAILED</div>}
        </details>
    );
}
