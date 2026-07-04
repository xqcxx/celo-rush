import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useGameStore } from '../store';

export function WalletSyncer() {
    const { address, isConnected } = useAccount();
    const setWalletAddress = useGameStore((s) => s.setWalletAddress);

    useEffect(() => {
        if (isConnected && address) {
            setWalletAddress(address);
        } else {
            setWalletAddress(null);
        }
    }, [address, isConnected, setWalletAddress]);

    return null;
}
