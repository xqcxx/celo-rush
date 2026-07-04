import { useWallet } from './useWallet';

export function ConnectButton() {
    const { isConnected, isConnecting, shortAddress, inMiniPay, connect, disconnect, isCorrectChain, switchToCelo } = useWallet();

    if (isConnecting) {
        if (inMiniPay) return null;
        return (
            <button className="btn wallet-btn connecting" disabled>
                CONNECTING...
            </button>
        );
    }

    if (isConnected && !isCorrectChain) {
        return (
            <button className="btn wallet-btn wrong-chain" onClick={switchToCelo}>
                SWITCH TO CELO
            </button>
        );
    }

    if (isConnected) {
        const connectedEl = (
            <button className="btn wallet-btn connected" onClick={disconnect}>
                {shortAddress}
            </button>
        );
        return connectedEl;
    }

    if (inMiniPay) return null;

    return (
        <button className="btn wallet-btn" onClick={connect}>
            CONNECT WALLET
        </button>
    );
}
