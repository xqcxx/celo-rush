import { keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const privateKey = process.env.SIGNER_PRIVATE_KEY;

let _signerAddress: string | null = null;
let _account: ReturnType<typeof privateKeyToAccount> | null = null;

function getAccount() {
    if (_account) return _account;
    if (!privateKey) throw new Error('SIGNER_PRIVATE_KEY is not configured');
    _account = privateKeyToAccount(privateKey as `0x${string}`);
    _signerAddress = _account.address;
    return _account;
}

export function signerAddress(): string {
    getAccount();
    return _signerAddress!;
}

export function signerConfigured(): boolean {
    return !!privateKey;
}

const TYPES = {
    RunClaim: [
        { name: 'runId', type: 'bytes32' },
        { name: 'player', type: 'address' },
        { name: 'score', type: 'uint256' },
        { name: 'rewardAmount', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
    ],
    BadgeClaim: [
        { name: 'player', type: 'address' },
        { name: 'badgeId', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
    ],
} as const;

const BADGE_DOMAIN = {
    name: 'Celo Rush ArcadeItems',
    version: '1',
    chainId: Number(process.env.CELO_CHAIN_ID || 44787),
    verifyingContract: (process.env.ARCADE_ITEMS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
} as const;

const DOMAIN = {
    name: 'Celo Rush RunRewards',
    version: '1',
    chainId: Number(process.env.CELO_CHAIN_ID || 44787),
    verifyingContract: (process.env.RUN_REWARDS_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
} as const;

export interface RewardVoucher {
    runId: string;
    player: string;
    score: number;
    rewardAmount: number;
    deadline: number;
    signature: string;
}

export interface BadgeVoucher {
    player: string;
    badgeId: number;
    deadline: number;
    signature: string;
}

export function computeReward(score: number): number {
    const reward = Math.floor(score / 10);
    return Math.max(1_000000000_000000000, Math.min(reward, 100_000000000_000000000));
}

interface SignParams {
    runId: string;
    player: string;
    score: number;
    rewardAmount: number;
    deadline?: number;
}

export async function signVoucher(params: SignParams): Promise<RewardVoucher> {
    const account = getAccount();
    const deadline = params.deadline || Math.floor(Date.now() / 1000) + 3600;

    const signature = await account.signTypedData({
        domain: DOMAIN,
        types: TYPES,
        primaryType: 'RunClaim',
        message: {
            runId: keccak256(toHex(params.runId)),
            player: params.player as `0x${string}`,
            score: BigInt(Math.floor(params.score)),
            rewardAmount: BigInt(Math.floor(params.rewardAmount)),
            deadline: BigInt(deadline),
        },
    });

    return {
        runId: params.runId,
        player: params.player,
        score: params.score,
        rewardAmount: params.rewardAmount,
        deadline,
        signature,
    };
}

export async function signBadgeVoucher(badgeId: number, player: string, deadline?: number): Promise<BadgeVoucher> {
    const account = getAccount();
    const dl = deadline || Math.floor(Date.now() / 1000) + 3600;

    const signature = await account.signTypedData({
        domain: BADGE_DOMAIN,
        types: { BadgeClaim: TYPES.BadgeClaim },
        primaryType: 'BadgeClaim',
        message: {
            player: player as `0x${string}`,
            badgeId: BigInt(badgeId),
            deadline: BigInt(dl),
        },
    });

    return {
        player,
        badgeId,
        deadline: dl,
        signature,
    };
}
