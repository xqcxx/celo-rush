import { isAddress } from 'viem';

const addressVars = [
    'PLAYER_REGISTRY_CONTRACT_ADDRESS',
    'RUN_REWARDS_CONTRACT_ADDRESS',
    'ARCADE_ITEMS_CONTRACT_ADDRESS',
    'CUSD_CONTRACT_ADDRESS',
    'WEEKLY_REWARDS_CONTRACT_ADDRESS',
] as const;

export function validateServerEnvironment(env: NodeJS.ProcessEnv = process.env): string[] {
    const errors: string[] = [];
    const chainId = Number(env.CELO_CHAIN_ID);
    if (!Number.isInteger(chainId) || chainId <= 0) errors.push('CELO_CHAIN_ID must be a positive integer');
    if (chainId !== 42220 && chainId !== 11142220) errors.push('CELO_CHAIN_ID must be Celo Mainnet (42220) or Celo Sepolia (11142220)');
    for (const name of addressVars) {
        if (!env[name] || !isAddress(env[name])) errors.push(`${name} must be a deployed address`);
    }
    for (const name of ['CELO_RPC_URL', 'MONGODB_URI', 'REDIS_URL', 'HMAC_SECRET'] as const) {
        if (!env[name]) errors.push(`${name} is required`);
    }
    if (chainId === 42220 && !env.SIGNER_PRIVATE_KEY) errors.push('SIGNER_PRIVATE_KEY is required on Mainnet');
    return errors;
}

export function assertServerEnvironment(env: NodeJS.ProcessEnv = process.env): void {
    const errors = validateServerEnvironment(env);
    if (errors.length) throw new Error(`Invalid Celo Rush server environment:\n- ${errors.join('\n- ')}`);
}
