import { useEffect, useRef, useState } from 'react';
import { useGameStore, refs } from '../store';
import { storage } from '../storage';
import { submitRun, shareLink, claimRunReward, type RewardVoucher } from '../api';
import { useClaimReward } from '../onchain/useClaimReward';

export function GameOverScreen() {
    const result = useGameStore((s) => s.result);
    const start = useGameStore((s) => s.start);
    const reset = useGameStore((s) => s.reset);
    const openBoard = useGameStore((s) => s.openBoard);
    const walletAddress = useGameStore((s) => s.walletAddress);
    const gameMode = useGameStore((s) => s.gameMode);
    const gameRunId = useGameStore((s) => s.gameRunId);
    const setGameRunId = useGameStore((s) => s.setGameRunId);

    const { claimReward, isPending: claimingTx, isConfirming: claimConfirming, isSuccess: claimSuccess, isError: claimError } = useClaimReward();

    const [name, setName] = useState(() => storage.name() || '');
    const [globalPos, setGlobalPos] = useState<number | null>(null);
    const [voucher, setVoucher] = useState<RewardVoucher | null>(null);
    const [claimStarted, setClaimStarted] = useState(false);
    const localId = useRef<string | null>(null);
    const submitted = useRef(false);

    const displayName = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : (name || '').trim() || 'ANON';

    const onName = (v: string) => {
        const clean = v.replace(/\s+/g, ' ').slice(0, 16);
        setName(clean);
        storage.setName(clean);
        if (localId.current) storage.rename(localId.current, clean || 'ANON');
    };

    const commit = () => {
        if (submitted.current || !result) return;
        submitted.current = true;
        const finalName = walletAddress || (name || '').trim() || 'ANON';
        if (localId.current) storage.rename(localId.current, finalName);
        if (refs.token) {
            void submitRun({
                token: refs.token,
                name: finalName,
                distance: result.distance,
                score: result.score,
                durationMs: result.durationMs,
                deathCause: result.cause,
                wallet: walletAddress || undefined,
                ref: storage.ref() || undefined,
            }).then((res) => {
                if (res && res.position) setGlobalPos(res.position);
            });
        }
    };

    const handleClaim = async () => {
        if (!result || !walletAddress || !gameRunId) return;
        setClaimStarted(true);
        const v = await claimRunReward(gameRunId, result.score, walletAddress);
        if (v) {
            setVoucher(v);
            claimReward(v);
        }
    };

    const act = (fn: () => void) => () => {
        commit();
        fn();
    };

    const share = () => {
        if (!result) return;
        const cause = result.cause.replace(/\.$/, '').toLowerCase();
        const handle = displayName;
        const text = `I charged ${result.distance.toLocaleString()}m in Celo Rush before ${cause}.

Rank: ${result.rank}.

Can you survive the Celo neon city?

#CeloRush`;
        const link = shareLink({ distance: result.distance, rank: result.rank, name: handle });
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}${link ? `&url=${encodeURIComponent(link)}` : ''}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const runItBack = () => {
        commit();
        setGameRunId(null);
        start();
    };

    useEffect(() => {
        if (!result || localId.current) return;
        const e = storage.add({ name: displayName, distance: result.distance, score: result.score, rank: result.rank, at: Date.now() });
        localId.current = e.id;
        const t = window.setTimeout(commit, 8000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    if (!result) return null;

    const isRanked = gameMode === 'ranked';
    const estimatedReward = isRanked ? Math.max(1, Math.floor(result.score / 10)) : 0;
    const claimDone = claimSuccess;

    return (
        <div className="overlay dead">
            <div className="panel">
                <div className="death">{result.cause}</div>
                <div className="charged">
                    <span>{isRanked ? 'RANKED RUN' : 'YOU CHARGED'}</span>
                    <strong>{result.distance.toLocaleString()} m</strong>
                </div>
                <div className="stats">
                    <div>
                        <span>RANK</span>
                        <b>{result.rank}</b>
                    </div>
                    <div>
                        <span>SCORE</span>
                        <b>{result.score.toLocaleString()}</b>
                    </div>
                </div>
                {globalPos && <div className="globalrank">GLOBAL&nbsp;#{globalPos.toLocaleString()}</div>}

                {isRanked && !claimStarted && (
                    <button className="btn primary" onClick={handleClaim}>
                        CLAIM ~{estimatedReward} RUSH ▸
                    </button>
                )}

                {claimingTx && <div className="register-status">CONFIRM IN WALLET...</div>}
                {claimConfirming && <div className="register-status">CLAIMING REWARD...</div>}
                {claimDone && <div className="globalrank" style={{ color: 'var(--neon)' }}>+{estimatedReward} RUSH CLAIMED!</div>}
                {claimError && <div className="register-error">CLAIM FAILED</div>}

                {walletAddress ? (
                    <div className="namebox">
                        <label className="namelabel">WALLET</label>
                        <div className="nameinput" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {displayName}
                        </div>
                    </div>
                ) : (
                    <div className="namebox">
                        <label className="namelabel" htmlFor="bull-name">
                            ENTER YOUR NAME FOR THE LEADERBOARD
                        </label>
                        <input
                            id="bull-name"
                            className="nameinput"
                            value={name}
                            onChange={(e) => onName(e.target.value)}
                            placeholder="YOUR USERNAME"
                            maxLength={16}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                )}

                <button className="btn primary" onClick={runItBack}>
                    RUN IT BACK
                </button>
                <button className="btn share" onClick={act(share)}>
                    SHARE TO X
                </button>
                <div className="row2">
                    <button className="btn ghost" onClick={act(openBoard)}>
                        LEADERBOARD
                    </button>
                    <button className="btn ghost" onClick={act(reset)}>
                        MENU
                    </button>
                </div>
            </div>
        </div>
    );
}
