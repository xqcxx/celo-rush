import { useAchievements } from '../onchain/useAchievements';
import { useGameStore } from '../store';

export function AchievementsPanel() {
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const { earned, claimable, claimBadge, isPending, error, getName, getDesc } = useAchievements(isRegistered ? walletAddress : null);

    if (!walletAddress || !isRegistered) return null;

    return (
        <details className="panel menu-panel achievements-panel">
            <summary className="panel-summary">ACHIEVEMENTS</summary>
            {error && <div className="register-error">BADGE TRANSACTION FAILED. TRY AGAIN.</div>}
            {claimable.length > 0 && (
                <div className="ach-section">
                    <span className="ach-label">CLAIMABLE</span>
                    {claimable.map((id) => (
                        <div key={id} className="ach-item">
                            <div className="ach-info">
                                <strong>{getName(id)}</strong>
                                <small>{getDesc(id)}</small>
                            </div>
                            <button className="btn wallet-btn" onClick={() => claimBadge(id)} disabled={isPending} style={{ width: 'auto', padding: '8px 14px', fontSize: '12px' }}>
                                {isPending ? '...' : 'CLAIM'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {earned.length > 0 && (
                <div className="ach-section">
                    <span className="ach-label earned-label">EARNED</span>
                    <div className="ach-grid">
                        {earned.map((id) => (
                            <div key={id} className="ach-badge earned">
                                <span className="ach-name">★ {getName(id)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {(earned.length === 0 && claimable.length === 0) && (
                <p className="sub">No achievements yet. Keep playing!</p>
            )}
        </details>
    );
}
