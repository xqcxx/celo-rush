import { useEffect, useRef } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wallet/provider';
import { useGameStore } from './store';
import { Audio } from './audio';
import { storage } from './storage';
import { Game } from './three/Game';
import { Hud } from './ui/Hud';
import { Menu } from './ui/Menu';
import { Gate } from './ui/Gate';
import { GameOverScreen } from './ui/GameOver';
import { Board } from './ui/Board';
import { Cinematic } from './ui/Cinematic';
import { MusicChip } from './ui/MusicChip';
import { WalletSyncer } from './wallet/WalletSyncer';
import { TouchControls } from './ui/TouchControls';

const queryClient = new QueryClient();

function AppInner() {
    const phase = useGameStore((s) => s.phase);
    const muted = useGameStore((s) => s.muted);
    const flashKey = useGameStore((s) => s.flashKey);
    const cloudKey = useGameStore((s) => s.cloudKey);
    const toggleMute = useGameStore((s) => s.toggleMute);
    const walletAddress = useGameStore((s) => s.walletAddress);
    const isRegistered = useGameStore((s) => s.isRegistered);
    const enterGate = useGameStore((s) => s.enterGate);
    const openBoard = useGameStore((s) => s.openBoard);
    const reset = useGameStore((s) => s.reset);
    const historyReady = useRef(false);
    const handlingPop = useRef(false);

    useEffect(() => {
        const route = phase === 'intro' ? 'intro' : phase;
        if (!historyReady.current) {
            window.history.replaceState({ bullRushPhase: route }, '', `#${route}`);
            historyReady.current = true;
            return;
        }
        if (handlingPop.current) {
            handlingPop.current = false;
            return;
        }
        window.history.pushState({ bullRushPhase: route }, '', `#${route}`);
    }, [phase]);

    useEffect(() => {
        const onPopState = () => {
            const target = window.history.state?.bullRushPhase as string | undefined;
            if (target === 'gate') {
                handlingPop.current = true;
                enterGate();
                return;
            }
            if (target === 'board') {
                handlingPop.current = true;
                openBoard();
                return;
            }

            // A run cannot be resumed by browser navigation. Return to the
            // nearest safe screen and keep the URL in sync with that screen.
            const fallback = target === 'playing' || target === 'dead' ? 'gate' : 'menu';
            window.history.replaceState({ bullRushPhase: fallback }, '', `#${fallback}`);
            handlingPop.current = true;
            if (fallback === 'gate') enterGate();
            else reset();
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [enterGate, openBoard, reset]);

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
        if (phase === 'playing' && walletAddress && isRegistered) {
            Audio.unlock();
            Audio.cycleMusic();
        }
        if (phase === 'dead') Audio.sfx('death');
    }, [phase, walletAddress, isRegistered]);

    const onMute = () => {
        Audio.unlock();
        toggleMute();
    };

    return (
        <div className="app">
            <WalletSyncer />
            <Game />
            {phase === 'playing' && <Hud />}
            {phase === 'playing' && <TouchControls />}
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
