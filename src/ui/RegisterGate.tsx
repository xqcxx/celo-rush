import { useEffect, useState } from 'react';
import { usePlayerRegistry } from '../onchain/usePlayerRegistry';
import { registerPlayer } from '../api';
import { useGameStore } from '../store';

export function RegisterGate() {
    const { register, isPending, isConfirming, isSuccess, isError, error, txHash } = usePlayerRegistry();
    const walletAddress = useGameStore((s) => s.walletAddress);
    const setRegistered = useGameStore((s) => s.setRegistered);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const syncRegistration = () => {
        if (!walletAddress) return;
        setSyncing(true);
        setSyncError(null);
        registerPlayer(walletAddress).then((ok) => {
            setSyncing(false);
            if (ok) setRegistered(true);
            else setSyncError('Confirmed on-chain, but backend sync failed. Check the API and retry.');
        });
    };

    useEffect(() => {
        if (isSuccess && txHash && walletAddress) {
            syncRegistration();
        }
    }, [isSuccess, txHash, walletAddress]);

    if (isPending || isConfirming || syncing) {
        return (
            <div className="register-box">
                <p className="register-status">{isPending ? 'CONFIRM IN WALLET...' : syncing ? 'SYNCING PLAYER...' : 'REGISTERING...'}</p>
            </div>
        );
    }

    if (syncError) {
        return (
            <div className="register-box">
                <p className="register-error">{syncError}</p>
                <button className="btn primary" onClick={syncRegistration}>
                    RETRY SYNC ▸
                </button>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="register-box">
                <p className="register-error">{error || 'TRANSACTION FAILED'}</p>
                <button className="btn primary" onClick={register}>
                    TRY AGAIN ▸
                </button>
            </div>
        );
    }

    return (
        <div className="register-box">
            <p className="register-prompt">SIGN TO CREATE YOUR PLAYER PROFILE</p>
            <p className="register-note">A one-time on-chain transaction records your wallet as a player.</p>
            <button className="btn primary" onClick={register}>
                REGISTER TO PLAY ▸
            </button>
        </div>
    );
}
