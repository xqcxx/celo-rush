import { createConfig, http } from 'wagmi';
import { celo, celoAlfajores } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const targetChainId = Number(import.meta.env.VITE_CHAIN_ID || 44787);

const celoTestnet = {
    ...celoAlfajores,
    rpcUrls: {
        default: { http: [import.meta.env.VITE_CELO_RPC_URL || 'https://alfajores-forno.celo-testnet.org'] },
        public: { http: [import.meta.env.VITE_CELO_RPC_URL || 'https://alfajores-forno.celo-testnet.org'] },
    },
} as const;

const celoMainnet = {
    ...celo,
    rpcUrls: {
        default: { http: ['https://forno.celo.org'] },
        public: { http: ['https://forno.celo.org'] },
    },
} as const;

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

export const config = createConfig({
    chains: [celoTestnet, celoMainnet],
    connectors: [
        injected({
            shimDisconnect: true,
            target() {
                return {
                    id: 'injected',
                    name: 'Injected',
                    provider: () => {
                        if (typeof window === 'undefined') return undefined;
                        return (window as any).ethereum;
                    },
                };
            },
        }),
        ...(projectId
            ? [
                  walletConnect({
                      projectId,
                      showQrModal: true,
                  }),
              ]
            : []),
    ],
    transports: {
        [celoTestnet.id]: http(),
        [celoMainnet.id]: http(),
    },
});

export function isMiniPay(): boolean {
    if (typeof window === 'undefined') return false;
    const ethereum = (window as any).ethereum;
    return ethereum?.isMiniPay === true;
}

export function getChainId(): number {
    return targetChainId;
}

export function getActiveChain() {
    return targetChainId === celo.id ? celoMainnet : celoTestnet;
}

export function chainDisplayName(): string {
    return targetChainId === celo.id ? 'Celo Mainnet' : 'Celo Alfajores Testnet';
}
