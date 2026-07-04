import { useGameStore } from '../store';
import { Audio } from '../audio';
import { ConnectButton } from '../wallet/ConnectButton';
import { CheckInButton } from '../onchain/CheckInButton';
import { RegisterGate } from './RegisterGate';
import { AchievementsPanel } from './AchievementsPanel';
import { ShopPanel } from './ShopPanel';
import { SeasonPanel } from './SeasonPanel';
import { VotingPanel } from './VotingPanel';

export function Menu() {
    const enterGate = useGameStore((s) => s.enterGate);
    const openBoard = useGameStore((s) => s.openBoard);
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const begin = () => {
        Audio.unlock();
        enterGate();
    };
    return (
        <div className="menu">
            <div className="menu-hero" />
            <div className="menu-scrim" />
            <div className="menu-content">
                <div className="kicker">THE CELO NEON CITY</div>
                <img className="logo" src="/logo.png" alt="CELO RUSH" />
                <p className="sub">Surf the Celo chain. Dodge rug pulls, scam bots &amp; gas spikes. Charge as far as you can.</p>

                {!walletAddress ? (
                    <div className="register-box">
                        <p className="register-prompt">CONNECT WALLET TO PLAY</p>
                        <p className="register-note">Each wallet maps to one player profile.</p>
                    </div>
                ) : !isRegistered ? (
                    <RegisterGate />
                ) : (
                    <button className="btn primary" onClick={begin}>
                        ENTER THE GATE ▸
                    </button>
                )}

                <ConnectButton />
                {isRegistered && <CheckInButton />}
                <button className="btn ghost" onClick={openBoard}>
                    LEADERBOARD
                </button>

                {isRegistered && (
                    <>
                        <SeasonPanel />
                        <AchievementsPanel />
                        <ShopPanel />
                        <VotingPanel />
                    </>
                )}

                <div className="controls">
                    <span>◀ ▶ / A D — switch lane · SPACE / tap — dash</span>
                </div>
            </div>
        </div>
    );
}
