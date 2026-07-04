import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useGameStore } from '../store';
import { checkPlayerRegistration } from '../api';

export function WalletSyncer() {
    const { address, isConnected } = useAccount();
    const setWalletAddress = useGameStore((s) => s.setWalletAddress);
    const setRegistered = useGameStore((s) => s.setRegistered);

    useEffect(() => {
        if (isConnected && address) {
            setWalletAddress(address);
            checkPlayerRegistration(address).then((reg) => setRegistered(reg));
        } else {
            setWalletAddress(null);
            setRegistered(false);
        }
    }, [address, isConnected, setWalletAddress, setRegistered]);

    return null;
}
