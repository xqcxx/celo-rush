# DAU Automation Guide

`scripts/dau.mjs` automates synthetic Celo Rush users for QA/load testing. It can estimate wallet funding needs, then run a full ranked gameplay path against the configured backend and Celo contracts.

The script is intended for controlled testing. Use `estimate` before `run`, especially on mainnet.

## What It Does

There are two profiles:

- `checkin`: lightweight DAU generation. It only calls `CheckIn.checkIn()` for wallets that have not checked in today.
- `autoplayer`: full ranked gameplay simulation.

The full ranked autoplayer profile is:

1. Derive a wallet from an encrypted interaction mnemonic.
2. Register the wallet on `PlayerRegistry` if needed.
3. Sync the player to the backend.
4. Set a deterministic human-like player name using `@faker-js/faker`.
5. Check in on-chain if the wallet has not checked in today.
6. Start a ranked run on-chain.
7. Start a backend run with the same `runId`.
8. Submit plausible anti-cheat-safe run stats.
9. Request a reward voucher from the backend.
10. Claim the ranked reward on-chain.
11. Confirm the successful claim receipt with the backend so the database records the claim.
12. Fetch and claim any currently eligible achievements, then sync each successful badge receipt.

## Setup

The script selects `.env.t` for `--env testnet` and `.env.production` (then `.env`) for
`--env mainnet`. For a mainnet run, use a local untracked `.env.mainnet` or pass
`--env-file` explicitly so testnet and mainnet addresses cannot be mixed:

```env
VITE_API_URL=http://localhost:8787
VITE_CELO_RPC_URL=https://...
VITE_CHAIN_ID=11142220
VITE_GAMETOKEN_CONTRACT_ADDRESS=0x...
VITE_PLAYER_REGISTRY_CONTRACT_ADDRESS=0x...
VITE_CHECKIN_CONTRACT_ADDRESS=0x...
VITE_RUN_REWARDS_CONTRACT_ADDRESS=0x...
```

Override the selected file when needed:

```bash
npm run dau -- estimate --env mainnet --env-file .env.mainnet --count 10
```

For local testing, make sure the backend is running and signer-loaded:

```bash
cd server
sudo docker compose up -d
npm run dev
```

Then from the repo root:

```bash
npm run dau -- help
```

## Encrypted Interaction Mnemonic

The first time you run the script for an environment, it asks you to paste a mnemonic and set an encryption password.

The mnemonic is encrypted with AES-256-GCM and saved with mode `0600`. Later runs
prompt only for the password. The script never reads private keys from a plaintext
file, command-line argument, or environment variable; derived private keys exist
only in process memory long enough to sign a transaction and are never printed.

Encrypted files are stored at:

```text
.keys/dau.testnet.seed.enc
.keys/dau.mainnet.seed.enc
```

On later runs, the script asks only for the password and decrypts the mnemonic in memory. The mnemonic and private keys are never printed.

Wallets use the standard EVM derivation path:

```text
m/44'/60'/0'/0/index
```

## Estimate Funding

Estimate 50 lightweight check-in DAUs, indexes `0..49`:

```bash
npm run dau -- estimate --env testnet --mode checkin --count 50
```

Estimate 50 full ranked autoplayer users:

```bash
npm run dau -- estimate --env testnet --mode autoplayer --count 50
```

Estimate both profiles in one command:

```bash
npm run dau -- estimate --env testnet --mode both --count 50
```

The default normal estimate mode is `checkin`, so this is equivalent:

```bash
npm run dau -- estimate --env testnet --count 50
```

Estimate a specific range:

```bash
npm run dau -- estimate --env testnet --start 20 --end 49
```

The estimate prints:

- Wallet index and address.
- Current CELO balance.
- Minimum estimated CELO cost.
- Recommended CELO funding using the margin.
- Current RUSH balance.
- RUSH needed.
- Funding status.

The default margin is `1.25x`:

```bash
npm run dau -- estimate --env testnet --count 50 --margin 1.5
```

## Run Users

Run lightweight check-in DAUs for wallets `0..49` on testnet:

```bash
npm run dau -- run --env testnet --mode checkin --start 0 --end 49
```

Run full ranked autoplayer users for wallets `0..49` on testnet:

```bash
npm run dau -- run --env testnet --mode autoplayer --start 0 --end 49
```

Choose generated outcomes explicitly:

```bash
npm run dau -- run --env testnet --mode autoplayer --outcome win --start 0 --end 9
npm run dau -- run --env testnet --mode autoplayer --outcome lose --start 10 --end 19
npm run dau -- run --env testnet --mode autoplayer --outcome random --start 20 --end 29
```

Each wallet receives a deterministic Faker-generated human-like name. `win` runs
reach roughly 6K meters and can unlock distance and clean-run achievements;
`lose` runs remain plausible but stay below the 1K threshold. After every run,
the script fetches claimable badges and completes the backend voucher, on-chain
mint, and receipt-confirmation flow for each eligible badge.

Run slowly and serially by default. Increase concurrency carefully:

```bash
npm run dau -- run --env testnet --mode checkin --start 0 --end 49 --concurrency 3 --delay-ms 1000
```

Preview the run plan without sending transactions:

```bash
npm run dau -- run --env testnet --mode autoplayer --start 0 --end 9 --dry-run
```

## Autoplayer Commands

Autoplayer mode is an alias for `--mode autoplayer`, with generated gameplay stats submitted through the backend.

Estimate:

```bash
npm run dau -- autoplayer estimate --env testnet --start 0 --end 9
```

Run:

```bash
npm run dau -- autoplayer run --env testnet --start 0 --end 9
```

These are equivalent:

```bash
npm run dau -- autoplayer run --env testnet --start 0 --end 9
npm run dau -- run --env testnet --mode autoplayer --start 0 --end 9
```

## Mainnet Safety

Mainnet is supported through `--env mainnet`, but run mode requires explicit confirmation:

```bash
npm run dau -- estimate --env mainnet --count 10
npm run dau -- run --env mainnet --start 0 --end 9 --yes
```

Before mainnet runs, make sure the selected env file points to mainnet:

```env
VITE_CHAIN_ID=42220
VITE_CELO_RPC_URL=https://...
VITE_API_URL=https://your-backend.example
```

If a wallet has already used its daily free ticket, the autoplayer checks and
submits a 5 RUSH allowance before starting the ranked run.

And make sure all contract addresses are mainnet deployments.

## Human-Like Names

Names are generated deterministically using `@faker-js/faker`, the wallet index, and a namespace. They are short enough for the backend's 16-character player-name limit.

Default namespace:

```bash
--names rush
```

Change namespace to produce a different deterministic name set:

```bash
npm run dau -- run --env testnet --start 0 --end 9 --names july
```

Example output names look like `MayaS04` or `LiamB17`, not `bot_0001`.

## Common Failures

- `--env testnet expects chain 11142220`: the selected env file has the wrong `VITE_CHAIN_ID`.
- `missing VITE_CELO_RPC_URL`: set RPC URL in `.env` or pass `--rpc-url`.
- `missing or invalid ... contract address`: pass the correct network file with `--env-file`; do not reuse testnet addresses for mainnet.
- API errors now include the HTTP status and backend error code; inspect Render logs for unexpected 500s.
- `player_not_registered`: backend sync failed or contract registration transaction failed.
- `backend flagged generated run as suspicious`: generated stats exceeded anti-cheat gates; reduce concurrency and retry.
- `insufficient funds`: fund the wallet with the recommended CELO amount from estimate mode.

## Recommended Workflow

1. Start backend and make sure `/health` is OK.
2. Run `estimate` for the target wallet count/range.
3. Fund the derived wallets with the recommended CELO amount.
4. Run `estimate` again to confirm status is `ok`.
5. Run `run` or `autoplayer run`.
6. Check the leaderboard and player stats through the backend.
