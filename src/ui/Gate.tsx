import { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { useRankedRun } from '../onchain/useRankedRun';
import { randomQuestions, type Question } from '../data/questions';
import { Audio } from '../audio';
import { startRun } from '../api';
import { refs } from '../store';

export function Gate() {
    const start = useGameStore((s) => s.start);
    const walletAddress = useGameStore((s) => s.walletAddress);
    const setGameRunId = useGameStore((s) => s.setGameRunId);
    const setActiveRunState = useGameStore((s) => s.setActiveRunState);
    const { startRankedRun, isPending, isConfirming, runId, isApproving, needsApproval, isPreparingRanked, isError: rankedError } = useRankedRun(walletAddress);
    const [questions] = useState<Question[]>(() => randomQuestions(3));
    const [idx, setIdx] = useState(0);
    const [wrong, setWrong] = useState<number | null>(null);
    const [charging, setCharging] = useState(false);
    const [awaitingRanked, setAwaitingRanked] = useState(false);
    const [startingRun, setStartingRun] = useState(false);

    const answer = (i: number) => {
        if (charging || awaitingRanked) return;
        Audio.unlock();
        const q = questions[idx];
        if (i === q.correct) {
            Audio.sfx('quizRight');
            if (idx < questions.length - 1) {
                setIdx(idx + 1);
                setWrong(null);
            } else {
                startRankedEntry();
            }
        } else {
            Audio.sfx('quizWrong');
            setWrong(i);
            window.setTimeout(() => setWrong((w) => (w === i ? null : w)), 650);
        }
    };

    const startRankedEntry = () => {
        if (charging || awaitingRanked || startingRun) return;
        startRankedRun();
        setAwaitingRanked(true);
    };

    const beginRun = async (rankedRunId: string | null) => {
        if (startingRun || !walletAddress) return;
        setStartingRun(true);
        setActiveRunState('starting');
        try {
            const { token } = await startRun(walletAddress, 'ranked', rankedRunId);
            refs.token = token;
            setActiveRunState('active');
            setCharging(true);
            Audio.sfx('charge');
            window.setTimeout(() => start(), 1700);
        } catch {
            setActiveRunState('failed');
            setStartingRun(false);
            setAwaitingRanked(false);
            setWrong(null);
        }
    };

    useEffect(() => {
        if (rankedError) {
            setAwaitingRanked(false);
            setStartingRun(false);
            setActiveRunState('failed');
        }
    }, [rankedError, setActiveRunState]);

    useEffect(() => {
        if (!runId) return;
        setGameRunId(runId);
        if (!charging) void beginRun(runId);
    }, [runId, charging, setGameRunId]);

    if (charging || startingRun || awaitingRanked || isPending || isConfirming || isApproving || isPreparingRanked) {
        return (
            <div className="overlay charging">
                <div className="charge-word">{isApproving ? 'APPROVING RUSH...' : isPreparingRanked ? 'STARTING RANKED RUN...' : (awaitingRanked || isPending || isConfirming) ? (needsApproval ? 'APPROVE RUSH...' : 'CONFIRM IN WALLET...') : 'CHARGE.'}</div>
            </div>
        );
    }

    const q = questions[idx];
    return (
        <div className="overlay gate">
            <div className="panel">
                <div className="kicker">CELO · THE GATEKEEPER</div>
                <div className="gate-mode-label">RANKED RUN · CELO LEADERBOARD</div>
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
                    {questions.map((qq, i) => (
                        <span key={qq.prompt} className={i <= idx ? 'on' : ''} />
                    ))}
                </div>
                <button className="btn ghost skip-trivia" onClick={startRankedEntry} disabled={charging || awaitingRanked || startingRun}>
                    SKIP TRIVIA · START RUN ▸
                </button>
            </div>
        </div>
    );
}
