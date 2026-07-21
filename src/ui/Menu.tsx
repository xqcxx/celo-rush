import { useGameStore } from '../store';
import { Audio } from '../audio';
import { ConnectButton } from '../wallet/ConnectButton';
import { CheckInButton } from '../onchain/CheckInButton';
import { RegisterGate } from './RegisterGate';
import { AchievementsPanel } from './AchievementsPanel';
import { ShopPanel } from './ShopPanel';
import { CapsulePanel } from './CapsulePanel';
import { UpgradePanel } from './UpgradePanel';
import { ProfilePanel } from './ProfilePanel';
import { WeeklyRewardsPanel } from './WeeklyRewardsPanel';
import { WeeklyRewardsAdminPanel } from './WeeklyRewardsAdminPanel';

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
                <section className="menu-primary-pane">
                    <div className="menu-brand-block">
                        <div className="kicker">THE CELO NEON CITY</div>
                        <img className="logo" src="/logo.png" alt="CELO RUSH" />
                        <h1 className="menu-title">Run the neon chain.</h1>
                        <p className="sub">Surf the Celo chain. Dodge rug pulls, scam bots &amp; gas spikes. Charge as far as you can.</p>
                    </div>

                    <div className="menu-main-actions">
                        {!walletAddress ? (
                            <div className="register-box">
                                    <p className="register-prompt">RANKED PLAY REQUIRES A REGISTERED WALLET</p>
                                    <p className="register-note">Every run enters the Celo leaderboard and uses the on-chain ranked ticket flow.</p>
                            </div>
                        ) : !isRegistered ? (
                            <RegisterGate />
                        ) : (
                            <button className="btn primary" onClick={begin}>
                                ENTER THE GATE ▸
                            </button>
                        )}

                        {isRegistered && <CheckInButton />}
                        <button className="btn ghost" onClick={openBoard}>LEADERBOARD</button>
                    </div>

                    <div className="controls">
                        <span>RANKED ONLY · ◀ ▶ / A D — switch lane · SPACE / tap — dash</span>
                    </div>
                </section>

                <aside className="menu-side-pane">
                    <ConnectButton />

                    {isRegistered ? (
                        <div className="menu-side-stack">
                            <AchievementsPanel />
                            <ProfilePanel />
                            <WeeklyRewardsPanel />
                            <WeeklyRewardsAdminPanel />
                            <ShopPanel />
                            <CapsulePanel />
                            <UpgradePanel />
                        </div>
                    ) : (
                        <div className="menu-tip-card">
                            <span>PLAYER SYSTEMS</span>
                            <strong>Register to unlock profile, rewards, shop, capsules and weekly competition.</strong>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
