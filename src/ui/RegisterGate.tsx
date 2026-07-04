import { useEffect } from 'react';
import { usePlayerRegistry } from '../onchain/usePlayerRegistry';
import { registerPlayer } from '../api';
import { useGameStore } from '../store';

export function RegisterGate() {
    const { register, isPending, isConfirming, isSuccess, isError, error, txHash } = usePlayerRegistry();
    const walletAddress = useGameStore((s) => s.walletAddress);
    const setRegistered = useGameStore((s) => s.setRegistered);

    useEffect(() => {
        if (isSuccess && txHash && walletAddress) {
            registerPlayer(walletAddress).then((ok) => {
                if (ok) setRegistered(true);
            });
        }
    }, [isSuccess, txHash, walletAddress, setRegistered]);

    if (isPending || isConfirming) {
        return (
            <div className="register-box">
                <p className="register-status">{isPending ? 'CONFIRM IN WALLET...' : 'REGISTERING...'}</p>
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
            <p className="register-note">A one-time signature. No gas fee required.</p>
            <button className="btn primary" onClick={register}>
                REGISTER TO PLAY ▸
            </button>
        </div>
    );
}
