import { isAddress } from 'viem';

const requiredContracts = {
    gameToken: 'VITE_GAMETOKEN_CONTRACT_ADDRESS',
    playerRegistry: 'VITE_PLAYER_REGISTRY_CONTRACT_ADDRESS',
    checkIn: 'VITE_CHECKIN_CONTRACT_ADDRESS',
    runRewards: 'VITE_RUN_REWARDS_CONTRACT_ADDRESS',
    arcadeItems: 'VITE_ARCADE_ITEMS_CONTRACT_ADDRESS',
    weeklyRewards: 'VITE_WEEKLY_REWARDS_CONTRACT_ADDRESS',
    cUSD: 'VITE_CUSD_CONTRACT_ADDRESS',
} as const;

function value(name: string): string {
    return String((import.meta.env as Record<string, unknown>)[name] || '').trim();
}

export function validateClientEnvironment(options: { production?: boolean } = {}): string[] {
    const errors: string[] = [];
    const chainId = Number(value('VITE_CHAIN_ID'));
    if (!Number.isInteger(chainId) || chainId <= 0) errors.push('VITE_CHAIN_ID must be a positive integer');
    if (!value('VITE_CELO_RPC_URL')) errors.push('VITE_CELO_RPC_URL is required');
    if (!value('VITE_API_URL')) errors.push('VITE_API_URL is required');

    for (const [label, name] of Object.entries(requiredContracts)) {
        const address = value(name);
        if (!address || !isAddress(address)) errors.push(`${name} must be a deployed address (${label})`);
    }
    if (options.production && chainId !== 42220) errors.push('production client must target Celo Mainnet (chain 42220)');
    return errors;
}

export function assertClientEnvironment(): void {
    const errors = validateClientEnvironment({ production: import.meta.env.PROD });
    if (errors.length) throw new Error(`Invalid Celo Rush environment:\n- ${errors.join('\n- ')}`);
}

// Production builds fail before wallet actions can be sent to a zero address.
if (import.meta.env.PROD) assertClientEnvironment();
