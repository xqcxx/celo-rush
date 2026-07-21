import { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { getWeeklyRequests, type WeeklyRequestEntry } from '../api';
import { CUSD_ADDRESS, WEEKLY_REWARDS_ADMIN, formatCusd, parseCusd, useCusdAdminActions, useCusdBalance, useEscrowBalance } from '../onchain/useWeeklyRewards';

export function WeeklyRewardsAdminPanel() {
    const wallet = useGameStore((s) => s.walletAddress);
    const isAdmin = !!wallet && WEEKLY_REWARDS_ADMIN !== '' && wallet.toLowerCase() === WEEKLY_REWARDS_ADMIN;
    const cUsd = useCusdBalance(wallet);
    const escrow = useEscrowBalance();
    const actions = useCusdAdminActions();
    const [requests, setRequests] = useState<WeeklyRequestEntry[]>([]);
    const [amount, setAmount] = useState('');
    const [selected, setSelected] = useState<string | null>(null);
    const [recipient, setRecipient] = useState('');

    useEffect(() => {
        if (!isAdmin) return;
        let alive = true;
        const load = async () => {
            const next = await getWeeklyRequests();
            if (alive) setRequests(next);
        };
        void load();
        const timer = window.setInterval(() => { void load(); }, 15_000);
        return () => { alive = false; window.clearInterval(timer); };
    }, [isAdmin, actions.isSuccess]);

    if (!isAdmin) return null;

    const amountUnits = parseCusd(amount);
    const busy = actions.isPending || actions.isConfirming;
    const selectedRequest = requests.find((request) => `${request.week}:${request.wallet}` === selected) || null;
    const recipientAddress = (recipient || wallet) as `0x${string}`;
    const pendingRequests = requests.filter((request) => request.requested && !request.withdrawn);

    return <details className="panel menu-panel admin-rewards-panel">
        <summary className="panel-summary">DEPLOYER · WEEKLY ESCROW</summary>
        <p className="sub">cUSD wallet balance: {formatCusd(cUsd.data as bigint | undefined)}</p>
        <p className="sub">Escrow balance: {formatCusd(escrow.data as bigint | undefined)}</p>
        <div className="reward-callout">Requests are signed only for the verified #1 player of a completed week. No winner address registration is required.</div>

        <span className="ach-label">REQUEST QUEUE</span>
        {pendingRequests.length === 0 && <p className="sub">No successful weekly reward requests yet.</p>}
        {pendingRequests.map((request) => {
            const key = `${request.week}:${request.wallet}`;
            return <button key={key} type="button" className={`weekly-admin-request ${selected === key ? 'selected' : ''}`} onClick={() => setSelected(key)}>
                <strong>WEEK {request.week} · #{request.position ?? '?'}</strong>
                <small>{request.wallet} · {request.distance.toLocaleString()} m · {request.games} runs</small>
                <small>{request.withdrawn ? 'WITHDRAWN' : request.approvedAmount !== '0' ? `APPROVED · ${formatCusd(BigInt(request.approvedAmount))} cUSD` : 'AWAITING AMOUNT'}</small>
            </button>;
        })}

        {selectedRequest && <>
            <p className="sub">Selected: WEEK {selectedRequest.week} · {selectedRequest.wallet}</p>
            <input className="profile-name-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Payout amount in cUSD" inputMode="decimal" />
            <button className="btn primary" disabled={!amount || amountUnits === 0n || busy} onClick={() => actions.approveReward(BigInt(selectedRequest.week), selectedRequest.wallet as `0x${string}`, amountUnits)}>APPROVE REQUEST</button>
        </>}

        <span className="ach-label">ESCROW FUNDING</span>
        <input className="profile-name-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in cUSD" inputMode="decimal" />
        <button className="btn ghost" disabled={!amount || amountUnits === 0n || busy} onClick={() => actions.approve(amountUnits)}>APPROVE cUSD SPEND</button>
        <button className="btn ghost" disabled={!amount || amountUnits === 0n || busy} onClick={() => actions.fund(amountUnits)}>FUND ESCROW</button>

        <span className="ach-label">DRAIN</span>
        <p className="sub">Draining is unrestricted; approved rewards may require refilling before withdrawal.</p>
        <input className="profile-name-input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Drain recipient (optional)" />
        <button className="btn ghost" disabled={!amount || amountUnits === 0n || busy} onClick={() => actions.drain(recipientAddress, amountUnits)}>DRAIN ESCROW</button>
        <small className="sub">Escrow: {CUSD_ADDRESS.slice(0, 8)}... · {actions.isConfirming ? 'Confirming...' : actions.isSuccess ? 'Confirmed' : ''}</small>
    </details>;
}
