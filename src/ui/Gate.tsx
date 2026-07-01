import { useState } from 'react';
import { useGameStore } from '../store';
import { QUESTIONS } from '../data/questions';
import { Audio } from '../audio';

export function Gate() {
    const start = useGameStore((s) => s.start);
    const [idx, setIdx] = useState(0);
    const [wrong, setWrong] = useState<number | null>(null);
    const [charging, setCharging] = useState(false);

    const answer = (i: number) => {
        if (charging) return;
        Audio.unlock();
        const q = QUESTIONS[idx];
        if (i === q.correct) {
            Audio.sfx('quizRight');
            if (idx < QUESTIONS.length - 1) {
                setIdx(idx + 1);
                setWrong(null);
            } else {
                setCharging(true);
                Audio.sfx('charge');
                window.setTimeout(() => start(), 1700);
            }
        } else {
            Audio.sfx('quizWrong');
            setWrong(i);
            window.setTimeout(() => setWrong((w) => (w === i ? null : w)), 650);
        }
    };

    if (charging) {
        return (
            <div className="overlay charging">
                <div className="charge-word">CHARGE.</div>
            </div>
        );
    }

    const q = QUESTIONS[idx];
    return (
        <div className="overlay gate">
            <div className="panel">
                <div className="kicker">PUMPFUN · THE GATEKEEPER</div>
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
