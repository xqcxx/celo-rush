import { useGameStore } from '../store';
import { Audio } from '../audio';
import { ConnectButton } from '../wallet/ConnectButton';
import { CheckInButton } from '../onchain/CheckInButton';

export function Menu() {
    const enterGate = useGameStore((s) => s.enterGate);
    const openBoard = useGameStore((s) => s.openBoard);
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
                <button className="btn primary" onClick={begin}>
                    ENTER THE GATE ▸
                </button>
                <ConnectButton />
                <CheckInButton />
                <button className="btn ghost" onClick={openBoard}>
                    LEADERBOARD
                </button>
                <div className="controls">
                    <span>◀ ▶ / A D — switch lane · SPACE / tap — dash</span>
                </div>
            </div>
        </div>
    );
}
