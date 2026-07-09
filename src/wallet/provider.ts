import { createConfig, http } from 'wagmi';
import { celo, celoAlfajores } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';

const targetChainId = Number(import.meta.env.VITE_CHAIN_ID || 44787);
const rpcUrl = import.meta.env.VITE_CELO_RPC_URL || 'https://alfajores-forno.celo-testnet.org';

const celoTestnet = {
    ...celoAlfajores,
    id: targetChainId,
    name: targetChainId === 11142220 ? 'Celo Sepolia' : celoAlfajores.name,
    network: targetChainId === 11142220 ? 'celo-sepolia' : celoAlfajores.network,
    rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
    },
} as const;

const customCeloTestnet = defineChain(celoTestnet);

const celoMainnet = {
    ...celo,
    rpcUrls: {
        default: { http: ['https://forno.celo.org'] },
        public: { http: ['https://forno.celo.org'] },
    },
} as const;

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

export const config = createConfig({
    chains: [customCeloTestnet, celoMainnet],
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
        [customCeloTestnet.id]: http(rpcUrl),
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
    return targetChainId === celo.id ? celoMainnet : customCeloTestnet;
}

export function chainDisplayName(): string {
    if (targetChainId === celo.id) return 'Celo Mainnet';
    if (targetChainId === 11142220) return 'Celo Sepolia';
    return 'Celo Alfajores Testnet';
}
