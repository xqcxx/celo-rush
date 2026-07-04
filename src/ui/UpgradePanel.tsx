import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useGameStore } from '../store';
import { getChainId } from '../wallet/provider';
import { SHOP_ITEMS } from '../api';
import { rush, useRushApproval } from '../onchain/useRushApproval';

const ARCADE_ITEMS_ABI = [
    {
        type: 'function',
        name: 'upgradeItem',
        inputs: [{ name: 'itemId', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

export const ARCADE_ITEMS_ADDRESS = (import.meta.env.VITE_ARCADE_ITEMS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export function UpgradePanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const chainId = getChainId();
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
    const [upgradingId, setUpgradingId] = useState<number | null>(null);
    const approval = useRushApproval(walletAddress, ARCADE_ITEMS_ADDRESS, rush(10_000));

    const upgrade = (itemId: number) => {
        setUpgradingId(itemId);
        if (!approval.hasAllowance) {
            approval.approve();
            return;
        }
        writeContract({
            address: ARCADE_ITEMS_ADDRESS,
            abi: ARCADE_ITEMS_ABI,
            functionName: 'upgradeItem',
            args: [BigInt(itemId)],
            chainId,
        });
    };

    if (!walletAddress || !isRegistered) return null;

    const upgradableItems = SHOP_ITEMS.filter((i) => i.maxLevel > 0);

    return (
        <div className="panel upgrade-panel">
            <div className="kicker">SKIN UPGRADES</div>
            <p className="sub">Upgrade items to higher levels. Each level costs more RUSH.</p>
            <div className="shop-grid">
                {upgradableItems.map((item) => (
                    <div key={item.id} className="shop-item">
                        <div className="shop-item-header">
                            <span className="shop-item-name">{item.name}</span>
                            <span className="shop-item-cat">LVL {item.maxLevel}</span>
                        </div>
                        <div className="shop-item-footer" style={{ marginTop: '8px' }}>
                            <span className="shop-item-price">Cost: {item.priceRush} RUSH/lvl</span>
                            <button
                                className="btn wallet-btn"
                                onClick={() => upgrade(item.id)}
                                disabled={isPending && upgradingId === item.id}
                                style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }}
                            >
                                {isPending && upgradingId === item.id
                                    ? (isConfirming ? '...' : 'SIGN...')
                                    : upgradingId === item.id && !approval.hasAllowance
                                        ? (approval.isPending || approval.isConfirming ? 'APPROVING...' : 'APPROVE')
                                        : 'UPGRADE'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
