import { useEffect } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wallet/provider';
import { useGameStore, refs } from './store';
import { Audio } from './audio';
import { storage } from './storage';
import { startRun } from './api';
import { Game } from './three/Game';
import { Hud } from './ui/Hud';
import { Menu } from './ui/Menu';
import { Gate } from './ui/Gate';
import { GameOverScreen } from './ui/GameOver';
import { Board } from './ui/Board';
import { Cinematic } from './ui/Cinematic';
import { MusicChip } from './ui/MusicChip';
import { WalletSyncer } from './wallet/WalletSyncer';

const queryClient = new QueryClient();

function AppInner() {
    const phase = useGameStore((s) => s.phase);
    const muted = useGameStore((s) => s.muted);
    const flashKey = useGameStore((s) => s.flashKey);
    const cloudKey = useGameStore((s) => s.cloudKey);
    const toggleMute = useGameStore((s) => s.toggleMute);

    useEffect(() => {
        storage.captureRef();
    }, []);

    useEffect(() => {
        const unlock = () => {
            Audio.unlock();
            const m = useGameStore.getState().musicMode;
            if (m >= 0) Audio.setMode(m);
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
        window.addEventListener('touchstart', unlock);
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };
    }, []);

    useEffect(() => {
        Audio.setMuted(muted);
    }, [muted]);

    useEffect(() => {
        if (phase === 'playing') {
            Audio.unlock();
            Audio.cycleMusic();
            void startRun().then(({ seed, token }) => {
                refs.seed = seed;
                refs.token = token;
            });
        }
        if (phase === 'dead') Audio.sfx('death');
    }, [phase]);

    const onMute = () => {
        Audio.unlock();
        toggleMute();
    };

    return (
        <div className="app">
            <WalletSyncer />
            <Game />
            {phase === 'playing' && <Hud />}
            {phase === 'intro' && <Cinematic />}
            {phase === 'menu' && <Menu />}
            {phase === 'gate' && <Gate />}
            {phase === 'dead' && <GameOverScreen />}
            {phase === 'board' && <Board />}
            {phase === 'playing' && flashKey > 0 && <div key={flashKey} className="hitflash" />}
            {phase === 'playing' && cloudKey > 0 && (
                <div key={`cloud-${cloudKey}`} className="cloudburst">
                    <span>BLACK CLOUD</span>
                </div>
            )}
            <button className="mute" onClick={onMute} aria-label="toggle sound">
                {muted ? '🔇' : '🔊'}
            </button>
            {phase !== 'playing' && <MusicChip />}
        </div>
    );
}

export function App() {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <AppInner />
            </QueryClientProvider>
        </WagmiProvider>
    );
}
