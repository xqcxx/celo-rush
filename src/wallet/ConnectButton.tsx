import { useWallet } from './useWallet';
import { chainDisplayName } from './provider';
import { useRushBalance } from '../onchain/useRushApproval';

export function ConnectButton() {
    const { address, isConnected, isConnecting, shortAddress, inMiniPay, connect, disconnect, isCorrectChain, switchToCelo } = useWallet();
    const chainName = chainDisplayName();
    const rushBalance = useRushBalance(address);

    if (inMiniPay) return null;

    if (isConnecting) {
        return (
            <div className="wallet-card">
                <div className="wallet-copy">
                    <span>Wallet</span>
                    <strong>Connecting...</strong>
                </div>
                <button className="wallet-action connecting" disabled>
                    Connecting
                </button>
            </div>
        );
    }

    if (isConnected && !isCorrectChain) {
        return (
            <div className="wallet-card wrong-chain">
                <div className="wallet-copy">
                    <span>Wrong network</span>
                    <strong>{shortAddress}</strong>
                </div>
                <button className="wallet-action wrong-chain" onClick={switchToCelo}>
                    Switch to {chainName}
                </button>
            </div>
        );
    }

    if (isConnected) {
        return (
            <div className="wallet-card connected">
                <div className="wallet-copy">
                    <span>Connected to {chainName}</span>
                    <strong>{shortAddress} · {rushBalance.isLoading ? '...' : rushBalance.formatted} RUSH</strong>
                </div>
                <button className="wallet-action secondary" onClick={disconnect}>
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <div className="wallet-card">
            <div className="wallet-copy">
                <span>Wallet required</span>
                <strong>Connect to play</strong>
            </div>
            <button className="wallet-action" onClick={connect}>
                Connect Wallet
            </button>
        </div>
    );
}
