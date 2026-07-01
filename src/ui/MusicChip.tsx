import { useGameStore } from '../store';
import { TRACKS } from '../audio';

// Radio selector: tap to cycle AUTO → the 5 mood tracks → AUTO.
// AUTO (default) lets the engine auto-cycle a fresh track each run; picking a
// mode locks the game to that track.
export function MusicChip() {
    const mode = useGameStore((s) => s.musicMode);
    const setMusicMode = useGameStore((s) => s.setMusicMode);
    const label = mode < 0 ? 'AUTO' : TRACKS[mode].mode;
    const cycle = () => setMusicMode(mode >= TRACKS.length - 1 ? -1 : mode + 1);
    return (
        <button className="musicchip" onClick={cycle} aria-label={`music: ${label}`}>
            ♪ {label}
        </button>
    );
}
