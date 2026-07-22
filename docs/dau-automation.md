# Celo Rush automation guide

`scripts/dau.mjs` is a controlled QA tool for exercising the deployed Celo Rush
contracts and backend. It has two deliberately separate modes:

| Mode | Credential | Wallets | Purpose |
| --- | --- | --- | --- |
| DAU booster | Encrypted mnemonic | Derivation index range | Check-in activity across synthetic wallets |
| Autoplayer | One encrypted private key | One player wallet | Full ranked run, reward, and achievement flow |

Use this only with wallets and funds that you control. Always run `estimate`
before sending transactions, especially on Mainnet.

## Prerequisites

From the repository root:

```bash
npm install
```

The selected backend must be running and configured with the same network,
contract addresses, MongoDB, Redis, and authorized signer as the frontend.
Check it before starting automation:

```bash
curl "$VITE_API_URL/health"
```

For local backend testing:

```bash
docker compose -f server/docker-compose.yml up -d
cd server
npm install
npm run dev
```

Return to the repository root before running `npm run dau`.

## Network configuration

The script selects configuration automatically:

- `--env testnet` prefers `.env.t`.
- `--env mainnet` prefers `.env.mainnet`, then `.env.production`, then `.env`.
- `--env-file <path>` overrides that selection.

For Mainnet, use a local untracked `.env.mainnet` rather than relying on a
blank or mixed environment file. It needs these frontend-style variables:

```env
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
VITE_CELO_RPC_URL=https://forno.celo.org
VITE_CHAIN_ID=42220
VITE_GAMETOKEN_CONTRACT_ADDRESS=0x...
VITE_PLAYER_REGISTRY_CONTRACT_ADDRESS=0x...
VITE_CHECKIN_CONTRACT_ADDRESS=0x...
VITE_RUN_REWARDS_CONTRACT_ADDRESS=0x...
VITE_ARCADE_ITEMS_CONTRACT_ADDRESS=0x...
```

For Celo Sepolia, use `VITE_CHAIN_ID=11142220`, the Sepolia RPC, the Sepolia
contract addresses, and the testnet API URL.

Do not commit `.env.mainnet`, private keys, mnemonics, or `.keys/` files.

## Encrypted credentials

### DAU booster mnemonic

The first DAU booster run for an environment asks for an interaction mnemonic
and an encryption password. It stores the encrypted mnemonic as:

```text
.keys/dau.testnet.seed.enc
.keys/dau.mainnet.seed.enc
```

The file uses AES-256-GCM and mode `0600`. Later runs ask only for the password.
The mnemonic is decrypted in memory and used to derive wallets at:

```text
m/44'/60'/0'/0/<index>
```

Derived private keys are never printed or written to disk.

### Autoplayer private key

The first autoplayer run asks for one player private key and an encryption
password. It stores:

```text
.keys/dau.testnet.player.key.enc
.keys/dau.mainnet.player.key.enc
```

This is a separate credential from the DAU mnemonic and from deployer/signer
key files. The private key is encrypted with AES-256-GCM, decrypted only in
memory, and never passed on the command line or through an environment variable.

Use another encrypted file when needed:

```bash
npm run dau -- autoplayer estimate \
  --env testnet \
  --private-key-file .keys/my-player.key.enc
```

## DAU booster: check-in wallets

The normal booster processes a range of wallets derived from the encrypted
mnemonic. It checks in each wallet once per day and skips wallets already
checked in.

Estimate 50 wallets:

```bash
npm run dau -- estimate \
  --env testnet \
  --mode checkin \
  --count 50
```

Estimate an explicit range:

```bash
npm run dau -- estimate \
  --env testnet \
  --mode checkin \
  --start 20 \
  --end 49
```

Run the range after funding the wallets:

```bash
npm run dau -- run \
  --env testnet \
  --mode checkin \
  --start 0 \
  --end 49
```

The estimate reports each wallet’s CELO balance, gas requirement, recommended
funding, RUSH balance, and status. Increase the recommended funding margin when
needed:

```bash
npm run dau -- estimate \
  --env testnet \
  --mode checkin \
  --count 50 \
  --margin 1.5
```

The normal booster does not run gameplay and does not claim ranked rewards.

## Autoplayer: one complete player flow

The autoplayer uses exactly one encrypted private key and never takes an index
range. It performs:

1. On-chain player registration if needed.
2. Backend player registration.
3. Faker-generated human-like name registration.
4. Daily check-in if needed.
5. RUSH allowance approval when the daily free ranked ticket is unavailable.
6. On-chain ranked run start.
7. Backend run initialization with the same run ID.
8. Plausible generated gameplay submission.
9. Reward voucher request.
10. On-chain reward claim.
11. Backend claim-receipt confirmation.
12. Eligibility lookup and receipt-confirmed achievement claims.

Estimate the one player’s funding requirement:

```bash
npm run dau -- autoplayer estimate \
  --env testnet
```

Preview the flow without transactions:

```bash
npm run dau -- autoplayer run \
  --env testnet \
  --outcome random \
  --dry-run
```

Run a winning profile, which reaches roughly 6,000 meters and can unlock the
distance and clean-run achievements:

```bash
npm run dau -- autoplayer run \
  --env testnet \
  --outcome win
```

Run a losing profile, which remains anti-cheat-plausible but stays below 1,000
meters:

```bash
npm run dau -- autoplayer run \
  --env testnet \
  --outcome lose
```

Choose randomly per run:

```bash
npm run dau -- autoplayer run \
  --env testnet \
  --outcome random
```

The default outcome is `random`. Names are deterministic for the selected
namespace and wallet index; customize the namespace with `--names`:

```bash
npm run dau -- autoplayer run \
  --env testnet \
  --names july \
  --outcome win
```

## Mainnet procedure

Use a dedicated encrypted player key and a Mainnet env file. First estimate:

```bash
npm run dau -- autoplayer estimate \
  --env mainnet \
  --env-file .env.mainnet
```

After funding the player wallet with the reported CELO and RUSH requirements,
run with explicit confirmation:

```bash
npm run dau -- autoplayer run \
  --env mainnet \
  --env-file .env.mainnet \
  --outcome win \
  --yes
```

The DAU booster can also run on Mainnet, but it uses the encrypted mnemonic and
an index range:

```bash
npm run dau -- estimate \
  --env mainnet \
  --env-file .env.mainnet \
  --mode checkin \
  --start 0 \
  --end 9

npm run dau -- run \
  --env mainnet \
  --env-file .env.mainnet \
  --mode checkin \
  --start 0 \
  --end 9 \
  --yes
```

Never reuse a Sepolia address or RPC URL in `.env.mainnet`.

## Concurrency and retry behavior

The default concurrency is `1`, with a 750 ms delay between wallets. Keep this
for initial testing. For the check-in booster only, concurrency can be raised
carefully:

```bash
npm run dau -- run \
  --env testnet \
  --mode checkin \
  --start 0 \
  --end 49 \
  --concurrency 3 \
  --delay-ms 1000
```

If a wallet fails, the script reports the wallet index and continues with the
remaining range. A failed autoplayer run can be retried, but inspect whether the
on-chain run already started before retrying. The backend run token remains
retry-safe until its expiry, while an already-claimed on-chain run must not be
claimed again.

## Common errors

| Error | Action |
| --- | --- |
| `expects chain 11142220` or `expects chain 42220` | Select the correct env file and chain ID. |
| `missing or invalid ... contract address` | Check every address in the selected env file. |
| `insufficient funds` | Fund the wallet with CELO, and RUSH if the free ticket is unavailable. |
| `player_not_registered` | Confirm the registration receipt and backend API configuration. |
| `invalid_token` | Start a fresh backend run; tokens expire and are network-bound. |
| `backend flagged generated run as suspicious` | Keep the generated stats unchanged and reduce concurrency. |
| `signer_not_configured` | Configure the backend authorized signer. |
| `/api/run/claim` returns `500` | Inspect Render logs; verify `SIGNER_PRIVATE_KEY` and Mainnet contract addresses. |
| `achievement ... already_claimed` | The badge is already minted or synchronized; do not retry indefinitely. |
| Wrong password/decryption error | Use the password for that environment’s encrypted file. |

## Recommended checklist

1. Confirm the backend `/health` endpoint.
2. Confirm the selected network and contract addresses.
3. Run `estimate`.
4. Fund only the displayed wallet(s).
5. Run one test wallet with `--dry-run` first.
6. Run one real testnet wallet with `--outcome win`.
7. Verify leaderboard, reward balance, achievement inventory, and backend logs.
8. Scale the DAU range or move to Mainnet only after the single-wallet flow succeeds.
