import { useState } from 'react';
import { useGameStore } from '../store';
import { useRankedRun } from '../onchain/useRankedRun';
import { QUESTIONS } from '../data/questions';
import { Audio } from '../audio';
import { RankedModeSelector } from './RankedModeSelector';

export function Gate() {
    const start = useGameStore((s) => s.start);
    const gameMode = useGameStore((s) => s.gameMode);
    const setGameRunId = useGameStore((s) => s.setGameRunId);
    const { startRankedRun, isPending, isConfirming, runId } = useRankedRun();
    const [idx, setIdx] = useState(0);
    const [wrong, setWrong] = useState<number | null>(null);
    const [charging, setCharging] = useState(false);
    const [awaitingRanked, setAwaitingRanked] = useState(false);

    const answer = (i: number) => {
        if (charging || awaitingRanked) return;
        Audio.unlock();
        const q = QUESTIONS[idx];
        if (i === q.correct) {
            Audio.sfx('quizRight');
            if (idx < QUESTIONS.length - 1) {
                setIdx(idx + 1);
                setWrong(null);
            } else {
                if (gameMode === 'ranked') {
                    setAwaitingRanked(true);
                    startRankedRun();
                } else {
                    setCharging(true);
                    Audio.sfx('charge');
                    window.setTimeout(() => start(), 1700);
                }
            }
        } else {
            Audio.sfx('quizWrong');
            setWrong(i);
            window.setTimeout(() => setWrong((w) => (w === i ? null : w)), 650);
        }
    };

    if (runId) {
        setGameRunId(runId);
        if (!charging) {
            setCharging(true);
            Audio.sfx('charge');
            window.setTimeout(() => start(), 1700);
        }
    }

    if (charging) {
        return (
            <div className="overlay charging">
                <div className="charge-word">{(awaitingRanked || isPending || isConfirming) ? 'CONFIRM IN WALLET...' : 'CHARGE.'}</div>
            </div>
        );
    }

    const q = QUESTIONS[idx];
    return (
        <div className="overlay gate">
            <div className="panel">
                <div className="kicker">CELO · THE GATEKEEPER</div>
                <RankedModeSelector />
                <div className={`gate-q ${wrong !== null ? 'shake' : ''}`}>“{q.prompt}”</div>
                {wrong !== null && <div className="not-ready">YOU ARE NOT READY.</div>}
                <div className="opts">
                    {q.options.map((o, i) => (
                        <button key={o} className={`opt ${wrong === i ? 'bad' : ''}`} onClick={() => answer(i)}>
                            {o}
                        </button>
                    ))}
                </div>
                <div className="qdots">
                    {QUESTIONS.map((qq, i) => (
                        <span key={qq.prompt} className={i <= idx ? 'on' : ''} />
                    ))}
                </div>
            </div>
        </div>
    );
}
