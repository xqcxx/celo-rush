import { useCallback, useEffect, useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useGameStore } from '../store';
import { getChainId } from '../wallet/provider';
import { SHOP_ITEMS } from '../api';
import { rush, useRushApproval } from '../onchain/useRushApproval';
import { ARCADE_ITEMS_ABI, ARCADE_ITEMS_ADDRESS, useArcadeInventory } from '../onchain/useArcadeInventory';

export function UpgradePanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const setCosmeticLevels = useGameStore((s) => s.setCosmeticLevels);
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess, isError: receiptError } = useWaitForTransactionReceipt({ hash: txHash });
    const [upgradingId, setUpgradingId] = useState<number | null>(null);
    const [upgradeAfterApprovalId, setUpgradeAfterApprovalId] = useState<number | null>(null);
    const approval = useRushApproval(walletAddress, ARCADE_ITEMS_ADDRESS, rush(Math.max(...SHOP_ITEMS.map((item) => item.priceRush * item.maxLevel))));
    const inventory = useArcadeInventory(walletAddress, setCosmeticLevels);
    const refetchInventory = inventory.refetch;

    useEffect(() => {
        if (isSuccess) void refetchInventory();
    }, [isSuccess, refetchInventory]);

    const sendUpgrade = useCallback((itemId: number) => {
        if (!inventory.owns(itemId)) return;
        writeContract({
            address: ARCADE_ITEMS_ADDRESS,
            abi: ARCADE_ITEMS_ABI,
            functionName: 'upgradeItem',
            args: [BigInt(itemId)],
            chainId,
        });
    }, [inventory, writeContract, chainId]);

    useEffect(() => {
        if (!upgradeAfterApprovalId || !approval.hasAllowance || approval.isPending || approval.isConfirming) return;
        const itemId = upgradeAfterApprovalId;
        setUpgradeAfterApprovalId(null);
        setUpgradingId(itemId);
        sendUpgrade(itemId);
    }, [upgradeAfterApprovalId, approval.hasAllowance, approval.isPending, approval.isConfirming, sendUpgrade]);

    const upgrade = (itemId: number) => {
        setUpgradingId(itemId);
        if (!approval.hasAllowance) {
            setUpgradeAfterApprovalId(itemId);
            approval.approve();
            return;
        }
        sendUpgrade(itemId);
    };

    if (!walletAddress || !isRegistered) return null;

    const upgradableItems = SHOP_ITEMS.filter((i) => i.maxLevel > 0);

    return (
        <details className="panel menu-panel upgrade-panel">
            <summary className="panel-summary">SKIN UPGRADES</summary>
            <p className="sub">Upgrade items to higher levels. Each level costs more RUSH.</p>
            <div className="shop-grid">
                {upgradableItems.map((item) => (
                    <div key={item.id} className="shop-item">
                        <div className="shop-item-header">
                            <span className="shop-item-name">{item.name}</span>
                            <span className="shop-item-cat">LVL {inventory.levelOf(item.id)}/{item.maxLevel}</span>
                        </div>
                        <div className="upgrade-bar" aria-hidden="true">
                            <span style={{ width: `${(inventory.levelOf(item.id) / item.maxLevel) * 100}%` }} />
                        </div>
                        <div className="shop-item-footer" style={{ marginTop: '8px' }}>
                            <span className="shop-item-price">
                                {inventory.owns(item.id)
                                    ? inventory.levelOf(item.id) >= item.maxLevel
                                        ? 'MAX LEVEL'
                                        : `Cost: ${item.priceRush * (inventory.levelOf(item.id) + 1)} RUSH`
                                    : 'BUY OR OPEN FIRST'}
                            </span>
                            <button
                                className="btn wallet-btn"
                                onClick={() => upgrade(item.id)}
                                disabled={!inventory.owns(item.id) || inventory.levelOf(item.id) >= item.maxLevel || (isPending && upgradingId === item.id)}
                                style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }}
                            >
                                {isPending && upgradingId === item.id
                                    ? (isConfirming ? '...' : 'SIGN...')
                                    : upgradeAfterApprovalId === item.id || (upgradingId === item.id && !approval.hasAllowance)
                                        ? (approval.isPending || approval.isConfirming ? 'APPROVING...' : 'APPROVE & UPGRADE')
                                        : 'UPGRADE'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {inventory.isLoading && <div className="register-status">LOADING LEVELS...</div>}
            {isSuccess && <div className="register-status">UPGRADE CONFIRMED</div>}
            {(error || receiptError || approval.isError) && <div className="register-error">UPGRADE FAILED. TRY AGAIN.</div>}
        </details>
    );
}
