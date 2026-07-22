#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { faker } from '@faker-js/faker';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  keccak256,
  parseEther,
  toHex,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KEY_DIR = path.join(ROOT, '.keys');
const DEFAULT_MARGIN = 1.25;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_DELAY_MS = 750;
const CLAIM_GAS_FALLBACK = 140_000n;
const BACKEND_TIMEOUT_MS = 30_000;

const CONTRACTS = {
  playerRegistry: [
    { type: 'function', name: 'register', inputs: [], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'isRegistered', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  ],
  checkIn: [
    { type: 'function', name: 'checkIn', inputs: [], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'hasCheckedInToday', inputs: [{ name: 'player', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  ],
  runRewards: [
    { type: 'function', name: 'startRankedRun', inputs: [{ name: 'runId', type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'claimRunReward', inputs: [
      { name: 'runId', type: 'bytes32' },
      { name: 'score', type: 'uint256' },
      { name: 'rewardAmount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'hasFreeTicket', inputs: [{ name: 'player', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  ],
  rush: [
    { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  ],
};

function usage() {
  console.log(`
Celo Rush DAU automation

Usage:
  npm run dau -- estimate --env testnet --count 50
  npm run dau -- estimate --env testnet --mode checkin --count 50
  npm run dau -- estimate --env testnet --mode autoplayer --count 10
  npm run dau -- estimate --env testnet --mode both --count 50
  npm run dau -- run --env testnet --mode checkin --start 0 --end 49
  npm run dau -- run --env testnet --start 0 --end 49
  npm run dau -- autoplayer estimate --env testnet --start 0 --end 9
  npm run dau -- autoplayer run --env testnet --start 0 --end 9

Options:
  --env testnet|mainnet       Required. Select encrypted seed + validate target chain.
  --mode checkin|autoplayer|both
                               estimate/run profile. Default checkin for normal commands, autoplayer for autoplayer commands.
  --count <n>                 Estimate indexes 0..n-1 when start/end are omitted.
  --start <n>                 First wallet index.
  --end <n>                   Last wallet index, inclusive.
  --api-url <url>             Override VITE_API_URL from .env.
  --rpc-url <url>             Override VITE_CELO_RPC_URL from .env.
  --env-file <path>           Override the env file selected for the target network.
  --margin <n>                Recommended funding multiplier. Default ${DEFAULT_MARGIN}.
  --names <namespace>         Deterministic human-like name namespace. Default rush.
  --concurrency <n>           Run concurrency. Default ${DEFAULT_CONCURRENCY}.
  --delay-ms <n>              Delay between wallets. Default ${DEFAULT_DELAY_MS}.
  --yes                       Required for mainnet run mode.
  --dry-run                   Print run plan without sending transactions.
`);
}

function parseArgs(argv) {
  const raw = [...argv];
  let group = null;
  let command = raw.shift();
  if (command === 'autoplayer') {
    group = 'autoplayer';
    command = raw.shift();
  }
  const opts = { group, command, margin: DEFAULT_MARGIN, names: 'rush', concurrency: DEFAULT_CONCURRENCY, delayMs: DEFAULT_DELAY_MS };
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (!arg.startsWith('--')) throw new Error(`unknown positional argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (key === 'yes' || key === 'dryRun') {
      opts[key] = true;
    } else {
      opts[key] = raw[++i];
      if (opts[key] === undefined) throw new Error(`missing value for ${arg}`);
    }
  }
  if (!opts.command || ['help', '-h', '--help'].includes(opts.command)) return { ...opts, help: true };
  if (!['estimate', 'run'].includes(opts.command)) throw new Error('command must be estimate or run');
  if (!['testnet', 'mainnet'].includes(opts.env || '')) throw new Error('--env testnet|mainnet is required');
  opts.mode = opts.mode || (opts.group === 'autoplayer' ? 'autoplayer' : 'checkin');
  if (!['checkin', 'autoplayer', 'both'].includes(opts.mode)) throw new Error('--mode must be checkin, autoplayer, or both');
  if (opts.command === 'run' && opts.mode === 'both') throw new Error('--mode both is for estimate only; run checkin and autoplayer separately');
  opts.count = toOptionalInt(opts.count, 'count');
  opts.start = toOptionalInt(opts.start, 'start');
  opts.end = toOptionalInt(opts.end, 'end');
  opts.margin = Number(opts.margin);
  opts.concurrency = Math.max(1, toOptionalInt(opts.concurrency, 'concurrency') ?? DEFAULT_CONCURRENCY);
  opts.delayMs = Math.max(0, toOptionalInt(opts.delayMs, 'delay-ms') ?? DEFAULT_DELAY_MS);
  if (!Number.isFinite(opts.margin) || opts.margin < 1) throw new Error('--margin must be a number >= 1');
  if (opts.start === undefined || opts.end === undefined) {
    if (opts.command === 'estimate' && opts.count !== undefined) {
      opts.start = 0;
      opts.end = opts.count - 1;
    } else {
      throw new Error('--start and --end are required, or use --count with estimate');
    }
  }
  if (opts.start < 0 || opts.end < opts.start) throw new Error('invalid --start/--end range');
  if (opts.env === 'mainnet' && opts.command === 'run' && !opts.yes) throw new Error('mainnet run mode requires --yes');
  return opts;
}

function toOptionalInt(value, label) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`--${label} must be an integer`);
  return n;
}

function readEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function loadConfig(opts) {
  const envCandidates = opts.envFile
    ? [path.resolve(ROOT, opts.envFile)]
    : opts.env === 'mainnet'
      ? [path.join(ROOT, '.env.mainnet'), path.join(ROOT, '.env.production'), path.join(ROOT, '.env')]
      : [path.join(ROOT, '.env.t'), path.join(ROOT, '.env')];
  const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
  const env = { ...(envPath ? readEnv(envPath) : {}), ...process.env };
  const chainId = Number(env.VITE_CHAIN_ID || (opts.env === 'mainnet' ? 42220 : 11142220));
  const expectedChainId = opts.env === 'mainnet' ? 42220 : 11142220;
  if (chainId !== expectedChainId) {
    throw new Error(`--env ${opts.env} expects chain ${expectedChainId}, but .env has VITE_CHAIN_ID=${chainId}`);
  }
  const cfg = {
    chainId,
    envName: opts.env,
    rpcUrl: opts.rpcUrl || env.VITE_CELO_RPC_URL,
    apiUrl: (opts.apiUrl || env.VITE_API_URL || '').replace(/\/$/, ''),
    envFile: envPath ? path.relative(ROOT, envPath) : '(process environment)',
    gameToken: env.VITE_GAMETOKEN_CONTRACT_ADDRESS,
    playerRegistry: env.VITE_PLAYER_REGISTRY_CONTRACT_ADDRESS,
    checkIn: env.VITE_CHECKIN_CONTRACT_ADDRESS,
    runRewards: env.VITE_RUN_REWARDS_CONTRACT_ADDRESS,
  };
  const source = envPath ? path.relative(ROOT, envPath) : 'process environment';
  for (const [key, value] of Object.entries(cfg)) {
    if (['envName', 'chainId', 'apiUrl', 'rpcUrl', 'envFile'].includes(key)) continue;
    if (!isAddress(value || '')) throw new Error(`missing or invalid ${key} contract address in ${source}; pass --env-file for the correct network`);
  }
  if (!cfg.rpcUrl) throw new Error(`missing VITE_CELO_RPC_URL in ${source} or --rpc-url`);
  if (!cfg.apiUrl) throw new Error(`missing VITE_API_URL in ${source} or --api-url`);
  return cfg;
}

function chainFor(cfg) {
  return defineChain({
    id: cfg.chainId,
    name: cfg.chainId === 42220 ? 'Celo Mainnet' : 'Celo Sepolia',
    nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
}

async function promptHidden(rl, prompt) {
  output.write(prompt);
  const write = output.write;
  output.write = () => true;
  try {
    return await rl.question('');
  } finally {
    output.write = write;
    output.write('\n');
  }
}

function encrypt(text, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  }, null, 2);
}

function decrypt(text, password) {
  const parsed = JSON.parse(text);
  if (parsed.v !== 1 || parsed.cipher !== 'aes-256-gcm' || parsed.kdf !== 'scrypt') throw new Error('unsupported encrypted seed format');
  const key = crypto.scryptSync(password, Buffer.from(parsed.salt, 'hex'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, 'hex')), decipher.final()]).toString('utf8').trim();
}

async function loadMnemonic(envName) {
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const keyFile = path.join(KEY_DIR, `dau.${envName}.seed.enc`);
  const rl = readline.createInterface({ input, output });
  try {
    if (!fs.existsSync(keyFile)) {
      console.log(`No encrypted DAU seed found at ${path.relative(ROOT, keyFile)}`);
      const mnemonic = (await promptHidden(rl, 'Paste interaction mnemonic (hidden): ')).trim().replace(/\s+/g, ' ');
      mnemonicToAccount(mnemonic, { accountIndex: 0 });
      const pass1 = await promptHidden(rl, 'New encryption password: ');
      const pass2 = await promptHidden(rl, 'Confirm encryption password: ');
      if (!pass1 || pass1 !== pass2) throw new Error('passwords are empty or do not match');
      fs.writeFileSync(keyFile, encrypt(mnemonic, pass1), { mode: 0o600 });
      console.log(`Encrypted DAU seed saved to ${path.relative(ROOT, keyFile)}`);
      return mnemonic;
    }
    const password = await promptHidden(rl, `Password for ${path.relative(ROOT, keyFile)}: `);
    const mnemonic = decrypt(fs.readFileSync(keyFile, 'utf8'), password);
    mnemonicToAccount(mnemonic, { accountIndex: 0 });
    return mnemonic;
  } finally {
    rl.close();
  }
}

function derive(mnemonic, index) {
  return mnemonicToAccount(mnemonic, { accountIndex: index });
}

function makeRunId(index) {
  return keccak256(toHex(`celo-rush-dau:${index}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`));
}

function stringSeed(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function cleanNamePart(value) {
  return value.replace(/[^A-Za-z0-9]/g, '');
}

function playerName(namespace, index) {
  faker.seed(stringSeed(namespace) + index);
  const first = cleanNamePart(faker.person.firstName());
  const last = cleanNamePart(faker.person.lastName());
  const suffix = String(index % 100).padStart(2, '0');
  let name = `${first}${last.slice(0, 1)}${suffix}`;
  if (name.length > 16) name = `${first.slice(0, 14)}${suffix}`;
  if (name.length < 3) name = `Player${suffix}`;
  return name;
}

function makeRunStats(index) {
  const durationMs = 55_000 + (index % 11) * 1_000;
  const distance = 1700 + (index % 17) * 73;
  const score = distance * 2 + (index % 9) * 25;
  return {
    distance,
    score,
    durationMs,
    deathCause: ['clipped by a red candle', 'jeeted in the neon lane', 'sniped by MEV'][index % 3],
    jeetsDodged: 8 + (index % 5),
    snipersSurvived: 3 + (index % 4),
    mevAvoided: 2 + (index % 3),
    maxCombo: 4 + (index % 6),
    damageTaken: 0,
  };
}

async function apiJson(apiUrl, pathName, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}${pathName}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = json?.error || json?.message || `${pathName} failed with ${res.status}`;
      throw new Error(`${pathName} ${res.status}: ${detail}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function estimateMaybe(publicClient, request, fallbackGas) {
  try {
    return await publicClient.estimateGas(request);
  } catch {
    return fallbackGas;
  }
}

async function estimateCheckinWallet({ cfg, publicClient, account, index, gasPrice, margin }) {
  const address = account.address;
  const [celoBalance, rushBalance, checkedIn] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({ address: cfg.gameToken, abi: CONTRACTS.rush, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
    publicClient.readContract({ address: cfg.checkIn, abi: CONTRACTS.checkIn, functionName: 'hasCheckedInToday', args: [address] }).catch(() => false),
  ]);

  let gas = 0n;
  const actions = [];
  if (!checkedIn) {
    const data = encodeFunctionData({ abi: CONTRACTS.checkIn, functionName: 'checkIn' });
    gas = await estimateMaybe(publicClient, { account: address, to: cfg.checkIn, data }, 110_000n);
    actions.push('checkIn');
  } else {
    actions.push('alreadyCheckedIn');
  }

  const minimum = gas * gasPrice;
  const recommended = (minimum * BigInt(Math.ceil(margin * 100))) / 100n;
  const rushNeeded = 0n;
  const status = celoBalance >= recommended ? 'ok' : 'underfunded';
  return { index, address, actions, gas, minimum, recommended, celoBalance, rushBalance, rushNeeded, status };
}

async function estimateAutoplayerWallet({ cfg, publicClient, account, index, gasPrice, margin, names }) {
  const address = account.address;
  const [celoBalance, rushBalance, registered, checkedIn, hasFreeTicket, allowance] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({ address: cfg.gameToken, abi: CONTRACTS.rush, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
    publicClient.readContract({ address: cfg.playerRegistry, abi: CONTRACTS.playerRegistry, functionName: 'isRegistered', args: [address] }).catch(() => false),
    publicClient.readContract({ address: cfg.checkIn, abi: CONTRACTS.checkIn, functionName: 'hasCheckedInToday', args: [address] }).catch(() => false),
    publicClient.readContract({ address: cfg.runRewards, abi: CONTRACTS.runRewards, functionName: 'hasFreeTicket', args: [address] }).catch(() => true),
    publicClient.readContract({ address: cfg.gameToken, abi: CONTRACTS.rush, functionName: 'allowance', args: [address, cfg.runRewards] }).catch(() => 0n),
  ]);

  let gas = 0n;
  const actions = [];
  if (!registered) {
    const data = encodeFunctionData({ abi: CONTRACTS.playerRegistry, functionName: 'register' });
    const g = await estimateMaybe(publicClient, { account: address, to: cfg.playerRegistry, data }, 80_000n);
    gas += g;
    actions.push('register');
  }
  if (!checkedIn) {
    const data = encodeFunctionData({ abi: CONTRACTS.checkIn, functionName: 'checkIn' });
    const g = await estimateMaybe(publicClient, { account: address, to: cfg.checkIn, data }, 110_000n);
    gas += g;
    actions.push('checkIn');
  }

  const runId = makeRunId(index);
  const needsEntryApproval = !hasFreeTicket && allowance < parseEther('5');
  if (needsEntryApproval) {
    const data = encodeFunctionData({ abi: CONTRACTS.rush, functionName: 'approve', args: [cfg.runRewards, parseEther('5')] });
    gas += await estimateMaybe(publicClient, { account: address, to: cfg.gameToken, data }, 60_000n);
    actions.push('approveRunEntry');
  }
  const startData = encodeFunctionData({ abi: CONTRACTS.runRewards, functionName: 'startRankedRun', args: [runId] });
  const startGas = await estimateMaybe(publicClient, { account: address, to: cfg.runRewards, data: startData }, 120_000n);
  gas += startGas;
  actions.push('startRankedRun');

  gas += CLAIM_GAS_FALLBACK;
  actions.push('claimRunReward');

  const minimum = gas * gasPrice;
  const recommended = (minimum * BigInt(Math.ceil(margin * 100))) / 100n;
  const rushNeeded = hasFreeTicket ? 0n : parseEther('5');
  const status = celoBalance >= recommended && rushBalance >= rushNeeded ? 'ok' : 'underfunded';
  return {
    index,
    address,
    name: playerName(names, index),
    actions,
    gas,
    minimum,
    recommended,
    celoBalance,
    rushBalance,
    rushNeeded,
    status,
  };
}

function profileTitle(mode) {
  if (mode === 'checkin') return 'check-in only profile';
  if (mode === 'autoplayer') return 'full ranked autoplayer profile';
  return 'profile';
}

function profileActions(mode) {
  if (mode === 'checkin') return 'check-in only: CheckIn.checkIn() for each wallet that has not checked in today';
  return 'autoplayer: register -> backend sync -> set name -> check-in -> start ranked run -> submit gameplay -> claim reward';
}

function printEstimate({ opts, cfg, gasPrice, rows, mode }) {
  const totalMinimum = rows.reduce((sum, r) => sum + r.minimum, 0n);
  const totalRecommended = rows.reduce((sum, r) => sum + r.recommended, 0n);
  const perWalletMax = rows.reduce((max, r) => r.recommended > max ? r.recommended : max, 0n);
  console.log(`\nDAU Estimate: ${profileTitle(mode)}`);
  console.log(`Profile actions: ${profileActions(mode)}`);
  console.log(`Command mode: ${opts.group === 'autoplayer' ? 'autoplayer ' : ''}${opts.command}; selected mode: ${mode}`);
  console.log(`Env: ${cfg.envName}`);
  console.log(`Config file: ${cfg.envFile}`);
  console.log(`Backend: ${cfg.apiUrl}`);
  console.log(`Wallets: ${rows.length} (${opts.start}-${opts.end})`);
  console.log(`Live gas price: ${formatEther(gasPrice)} CELO/gas`);
  console.log(`Minimum total CELO: ${formatEther(totalMinimum)}`);
  console.log(`Recommended total CELO (${opts.margin}x): ${formatEther(totalRecommended)}`);
  console.log(`Recommended per-wallet max: ${formatEther(perWalletMax)} CELO`);
  console.log('\nIndex  Address          CELO Bal     Min CELO     Recommended   RUSH Bal    RUSH Needed  Status');
  for (const r of rows) {
    console.log([
      String(r.index).padEnd(7),
      `${r.address.slice(0, 6)}...${r.address.slice(-4)}`.padEnd(17),
      formatEther(r.celoBalance).slice(0, 10).padEnd(13),
      formatEther(r.minimum).slice(0, 10).padEnd(13),
      formatEther(r.recommended).slice(0, 12).padEnd(14),
      formatEther(r.rushBalance).slice(0, 9).padEnd(12),
      formatEther(r.rushNeeded).slice(0, 9).padEnd(13),
      r.status,
    ].join(''));
  }
  console.log('');
}

async function sendTx(publicClient, walletClient, request, label) {
  const hash = await walletClient.sendTransaction(request);
  console.log(`  ${label}: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function runCheckinWallet({ cfg, chain, publicClient, mnemonic, index, opts }) {
  const account = derive(mnemonic, index);
  const walletClient = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
  const address = account.address;
  console.log(`\n[${index}] ${address}`);

  if (opts.dryRun) {
    console.log('  dry-run: would call CheckIn.checkIn() if not checked in today');
    return { index, address, ok: true, dryRun: true };
  }

  const checkedIn = await publicClient.readContract({ address: cfg.checkIn, abi: CONTRACTS.checkIn, functionName: 'hasCheckedInToday', args: [address] }).catch(() => false);
  if (!checkedIn) {
    await sendTx(publicClient, walletClient, { to: cfg.checkIn, data: encodeFunctionData({ abi: CONTRACTS.checkIn, functionName: 'checkIn' }) }, 'checkIn');
  } else {
    console.log('  checkIn: already checked in today');
  }
  return { index, address, ok: true };
}

async function runAutoplayerWallet({ cfg, chain, publicClient, mnemonic, index, opts }) {
  const account = derive(mnemonic, index);
  const walletClient = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
  const address = account.address;
  console.log(`\n[${index}] ${address}`);

  if (opts.dryRun) {
    console.log('  dry-run: would register, sync backend, set name, check in, start ranked run, submit run, claim reward');
    return { index, address, ok: true, dryRun: true };
  }

  const registered = await publicClient.readContract({ address: cfg.playerRegistry, abi: CONTRACTS.playerRegistry, functionName: 'isRegistered', args: [address] }).catch(() => false);
  if (!registered) {
    await sendTx(publicClient, walletClient, { to: cfg.playerRegistry, data: encodeFunctionData({ abi: CONTRACTS.playerRegistry, functionName: 'register' }) }, 'register');
  } else {
    console.log('  register: already registered');
  }
  await apiJson(cfg.apiUrl, '/api/players/register', { wallet: address });
  await apiJson(cfg.apiUrl, `/api/players/${address}/name`, { name: playerName(opts.names, index) }).catch((e) => console.log(`  name: ${e.message}`));

  const checkedIn = await publicClient.readContract({ address: cfg.checkIn, abi: CONTRACTS.checkIn, functionName: 'hasCheckedInToday', args: [address] }).catch(() => false);
  if (!checkedIn) {
    await sendTx(publicClient, walletClient, { to: cfg.checkIn, data: encodeFunctionData({ abi: CONTRACTS.checkIn, functionName: 'checkIn' }) }, 'checkIn');
  } else {
    console.log('  checkIn: already checked in today');
  }

  const runId = makeRunId(index);
  const hasFreeTicket = await publicClient.readContract({ address: cfg.runRewards, abi: CONTRACTS.runRewards, functionName: 'hasFreeTicket', args: [address] }).catch(() => false);
  if (!hasFreeTicket) {
    const allowance = await publicClient.readContract({ address: cfg.gameToken, abi: CONTRACTS.rush, functionName: 'allowance', args: [address, cfg.runRewards] }).catch(() => 0n);
    const entryCost = parseEther('5');
    if (allowance < entryCost) {
      await sendTx(publicClient, walletClient, {
        to: cfg.gameToken,
        data: encodeFunctionData({ abi: CONTRACTS.rush, functionName: 'approve', args: [cfg.runRewards, entryCost] }),
      }, 'approveRunEntry');
    }
  }
  await sendTx(publicClient, walletClient, {
    to: cfg.runRewards,
    data: encodeFunctionData({ abi: CONTRACTS.runRewards, functionName: 'startRankedRun', args: [runId] }),
  }, 'startRankedRun');

  const started = await apiJson(cfg.apiUrl, '/api/run/start', { wallet: address, gameMode: 'ranked', runId });
  const stats = makeRunStats(index);
  const submitted = await apiJson(cfg.apiUrl, '/api/run/submit', {
    token: started.token,
    name: playerName(opts.names, index),
    wallet: address,
    gameMode: 'ranked',
    runId,
    ...stats,
  });
  if (submitted.hidden) throw new Error('backend flagged generated run as suspicious');
  console.log(`  submit: ${stats.distance}m score=${stats.score} position=${submitted.position ?? 'n/a'}`);

  const voucher = await apiJson(cfg.apiUrl, '/api/run/claim', { wallet: address, runId, score: stats.score });
  const claimTxHash = await sendTx(publicClient, walletClient, {
    to: cfg.runRewards,
    data: encodeFunctionData({
      abi: CONTRACTS.runRewards,
      functionName: 'claimRunReward',
      args: [voucher.runId, BigInt(voucher.score), BigInt(voucher.rewardAmount), BigInt(voucher.deadline), voucher.signature],
    }),
  }, 'claimRunReward');
  await apiJson(cfg.apiUrl, '/api/run/claim/confirm', { runId, wallet: address, txHash: claimTxHash });
  console.log('  claim: backend confirmation stored');

  return { index, address, ok: true };
}

async function withPool(items, concurrency, delayMs, worker) {
  const results = [];
  let next = 0;
  async function runNext() {
    while (next < items.length) {
      const item = items[next++];
      try {
        results.push(await worker(item));
      } catch (e) {
        results.push({ index: item, ok: false, error: e instanceof Error ? e.message : String(e) });
        console.error(`\n[${item}] failed: ${e instanceof Error ? e.message : e}`);
      }
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runNext));
  return results.sort((a, b) => a.index - b.index);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  const cfg = loadConfig(opts);
  const chain = chainFor(cfg);
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const mnemonic = await loadMnemonic(opts.env);
  const gasPrice = await publicClient.getGasPrice();
  const indexes = Array.from({ length: opts.end - opts.start + 1 }, (_, i) => opts.start + i);

  if (opts.command === 'estimate') {
    const modes = opts.mode === 'both' ? ['checkin', 'autoplayer'] : [opts.mode];
    for (const mode of modes) {
      const rows = [];
      for (const index of indexes) {
        const account = derive(mnemonic, index);
        rows.push(mode === 'checkin'
          ? await estimateCheckinWallet({ cfg, publicClient, account, index, gasPrice, margin: opts.margin })
          : await estimateAutoplayerWallet({ cfg, publicClient, account, index, gasPrice, margin: opts.margin, names: opts.names }));
      }
      printEstimate({ opts, cfg, gasPrice, rows, mode });
    }
    return;
  }

  if (opts.env === 'mainnet') console.log('MAINNET RUN MODE ENABLED. Transactions will spend real CELO.');
  const worker = opts.mode === 'checkin' ? runCheckinWallet : runAutoplayerWallet;
  const results = await withPool(indexes, opts.concurrency, opts.delayMs, (index) => worker({ cfg, chain, publicClient, mnemonic, index, opts }));
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  console.log(`\nRun complete: ${ok} ok, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
