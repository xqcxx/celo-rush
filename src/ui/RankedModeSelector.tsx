import { useGameStore } from '../store';

export function RankedModeSelector() {
    const gameMode = useGameStore((s) => s.gameMode);
    const setGameMode = useGameStore((s) => s.setGameMode);

    return (
        <div className="mode-selector">
            <button
                className={`mode-btn ${gameMode === 'casual' ? 'on' : ''}`}
                onClick={() => setGameMode('casual')}
            >
                CASUAL · FREE PLAY
            </button>
            <button
                className={`mode-btn ${gameMode === 'ranked' ? 'on' : ''}`}
                onClick={() => setGameMode('ranked')}
            >
                RANKED · EARN RUSH
            </button>
        </div>
    );
}
