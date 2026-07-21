import { refs, useGameStore, DASH_COOLDOWN, DASH_DURATION } from '../store';
import * as THREE from 'three';
import { Audio } from '../audio';
import type { PointerEvent } from 'react';

export function TouchControls() {
    const move = (direction: number) => {
        if (useGameStore.getState().phase !== 'playing') return;
        refs.laneTarget = THREE.MathUtils.clamp(refs.laneTarget + direction, -1, 1);
    };
    const dash = () => {
        if (useGameStore.getState().phase !== 'playing' || refs.elapsed < refs.dashReadyAt) return;
        refs.dashUntil = refs.elapsed + DASH_DURATION;
        refs.dashReadyAt = refs.elapsed + DASH_COOLDOWN;
        refs.invulnUntil = Math.max(refs.invulnUntil, refs.dashUntil);
        Audio.sfx('dash');
    };
    const press = (action: () => void) => (event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        action();
    };

    return <div className="touch-controls" aria-label="game controls">
        <button type="button" onPointerDown={press(() => move(-1))} aria-label="move left">◀</button>
        <button type="button" className="dash-control" onPointerDown={press(dash)} aria-label="dash">DASH</button>
        <button type="button" onPointerDown={press(() => move(1))} aria-label="move right">▶</button>
    </div>;
}
