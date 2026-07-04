import { useEffect } from 'react';
import { useCheckIn } from './useCheckIn';
import { useWallet } from '../wallet/useWallet';

export function CheckInButton() {
    const { isConnected, inMiniPay } = useWallet();
    const { canCheckIn, hasCheckedIn, streak, isPending, isConfirming, isSuccess, checkIn } = useCheckIn();

    useEffect(() => {
        if (isSuccess) {
            // refresh UI to reflect new check-in state
            window.location.reload();
        }
    }, [isSuccess]);

    if (!isConnected) return null;

    if (isPending || isConfirming) {
        return (
            <button className="btn wallet-btn" disabled>
                {inMiniPay ? 'SIGNING IN MINIPAY...' : 'SIGNING...'}
            </button>
        );
    }

    if (hasCheckedIn) {
        return (
            <div className="checkin-done">
                <span className="checkin-streak">DAY {streak} STREAK</span>
            </div>
        );
    }

    if (canCheckIn) {
        return (
            <button className="btn primary checkin-btn" onClick={checkIn}>
                CHECK IN · +10 RUSH
            </button>
        );
    }

    return (
        <button className="btn wallet-btn" disabled>
            CHECK IN
        </button>
    );
}
