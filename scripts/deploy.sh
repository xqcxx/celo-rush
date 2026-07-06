#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy.sh --env <mainnet|testnet> [options]

Options:
  --env mainnet|testnet       Required. Deploy to Celo mainnet or Celo Sepolia testnet.
  --key-name <name>           Encrypted key filename stem. Default: deployer
  --base-uri <uri>            ArcadeItems metadata URI. Default depends on env.
  --signer <address>          Authorized backend signer address. Default: deployer address.
  --rpc-url <url|alias>       Override RPC endpoint/alias for this run.
  --gas-price <price>         Override gas price, e.g. 75gwei or 100gwei.
  --resume                    Resume the latest failed broadcast for this script/network.
  --skip-verify               Deploy without explorer verification.
  -h, --help                  Show this help.

Security:
  - First run prompts for a private key and encrypts it to .keys/<name>.<env>.key.enc.
  - Later runs prompt only for the encryption password.
  - Plaintext key is written only to a temporary file and removed on exit.
USAGE
}

ENVIRONMENT=""
KEY_NAME="deployer"
BASE_URI=""
AUTHORIZED_SIGNER=""
VERIFY=1
RESUME=0
RPC_OVERRIDE=""
GAS_PRICE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENVIRONMENT="${2:-}"
      shift 2
      ;;
    --key-name)
      KEY_NAME="${2:-}"
      shift 2
      ;;
    --base-uri)
      BASE_URI="${2:-}"
      shift 2
      ;;
    --signer)
      AUTHORIZED_SIGNER="${2:-}"
      shift 2
      ;;
    --rpc-url)
      RPC_OVERRIDE="${2:-}"
      shift 2
      ;;
    --gas-price)
      GAS_PRICE="${2:-}"
      shift 2
      ;;
    --skip-verify)
      VERIFY=0
      shift
      ;;
    --resume)
      RESUME=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$ENVIRONMENT" != "mainnet" && "$ENVIRONMENT" != "testnet" ]]; then
  echo "Error: --env must be either 'mainnet' or 'testnet'." >&2
  usage
  exit 1
fi

for bin in forge node openssl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Error: required command '$bin' is not installed or not on PATH." >&2
    exit 1
  fi
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_DIR="$ROOT_DIR/.keys"
KEY_FILE="$KEY_DIR/${KEY_NAME}.${ENVIRONMENT}.key.enc"
TMP_KEY_FILE="$(mktemp)"

cleanup() {
  if [[ -f "$TMP_KEY_FILE" ]]; then
    # Best-effort wipe of the temporary plaintext key only.
    # The encrypted key at $KEY_FILE is intentionally preserved for future deployments.
    if command -v shred >/dev/null 2>&1; then
      shred -u "$TMP_KEY_FILE" || rm -f "$TMP_KEY_FILE"
    else
      rm -f "$TMP_KEY_FILE"
    fi
  fi
  unset PRIVATE_KEY || true
}
trap cleanup EXIT INT TERM

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

read_secret() {
  local prompt="$1"
  local value
  read -r -s -p "$prompt" value
  echo >&2
  printf '%s' "$value"
}

normalize_private_key() {
  local key="$1"
  key="${key//$'\n'/}"
  key="${key//$'\r'/}"
  if [[ "$key" != 0x* ]]; then
    key="0x$key"
  fi
  if [[ ! "$key" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    echo "Error: private key must be 32 bytes hex, with or without 0x prefix." >&2
    exit 1
  fi
  printf '%s' "$key"
}

if [[ ! -f "$KEY_FILE" ]]; then
  echo "No encrypted key found at $KEY_FILE"
  echo "Creating one now. Your private key will not be stored in plaintext."
  RAW_KEY="$(read_secret 'Private key (input hidden): ')"
  PRIVATE_KEY_TO_ENCRYPT="$(normalize_private_key "$RAW_KEY")"
  unset RAW_KEY

  PASS_1="$(read_secret 'New encryption password: ')"
  PASS_2="$(read_secret 'Confirm encryption password: ')"
  if [[ "$PASS_1" != "$PASS_2" ]]; then
    echo "Error: passwords do not match." >&2
    exit 1
  fi
  if [[ -z "$PASS_1" ]]; then
    echo "Error: password cannot be empty." >&2
    exit 1
  fi

  printf '%s' "$PRIVATE_KEY_TO_ENCRYPT" | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -out "$KEY_FILE" -pass "pass:$PASS_1"
  chmod 600 "$KEY_FILE"
  unset PRIVATE_KEY_TO_ENCRYPT PASS_1 PASS_2
  echo "Encrypted key saved to $KEY_FILE"
  echo "This encrypted key file will be kept for future deployments. Only temporary plaintext copies are wiped."
fi

KEY_PASSWORD="$(read_secret "Password for $KEY_FILE: ")"
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$KEY_FILE" -out "$TMP_KEY_FILE" -pass "pass:$KEY_PASSWORD" 2>/dev/null; then
  echo "Error: failed to decrypt key. Wrong password or corrupted key file." >&2
  exit 1
fi
unset KEY_PASSWORD
chmod 600 "$TMP_KEY_FILE"

PRIVATE_KEY="$(normalize_private_key "$(<"$TMP_KEY_FILE")")"
export PRIVATE_KEY

DEPLOYER_ADDRESS="$(PRIVATE_KEY="$PRIVATE_KEY" node --input-type=module -e 'import { privateKeyToAccount } from "viem/accounts"; console.log(privateKeyToAccount(process.env.PRIVATE_KEY).address);')"
if [[ -z "$AUTHORIZED_SIGNER" ]]; then
  AUTHORIZED_SIGNER="$DEPLOYER_ADDRESS"
fi
export AUTHORIZED_SIGNER

if [[ "$ENVIRONMENT" == "mainnet" ]]; then
  RPC_ALIAS="celo"
  CHAIN_ID="42220"
  DEFAULT_BASE_URI="https://api.celorush.xyz/metadata/{id}.json"
else
  RPC_ALIAS="celo_sepolia"
  CHAIN_ID="11142220"
  DEFAULT_BASE_URI="https://api-testnet.celorush.xyz/metadata/{id}.json"
fi

if [[ -n "$RPC_OVERRIDE" ]]; then
  RPC_ALIAS="$RPC_OVERRIDE"
fi

if [[ -z "$BASE_URI" ]]; then
  BASE_URI="$DEFAULT_BASE_URI"
fi
export ARCADE_BASE_URI="$BASE_URI"

if [[ "$VERIFY" -eq 1 ]]; then
  if [[ -z "${CELOSCAN_API_KEY:-}" ]]; then
    read -r -p "CELOSCAN_API_KEY is not set. Enter API key for verification: " CELOSCAN_API_KEY
    export CELOSCAN_API_KEY
  fi
  if [[ -z "${CELOSCAN_API_KEY:-}" ]]; then
    echo "Error: CELOSCAN_API_KEY is required for verification. Use --skip-verify to deploy without verifying." >&2
    exit 1
  fi
fi

echo "Deployment target: $ENVIRONMENT (chain $CHAIN_ID, rpc alias $RPC_ALIAS)"
echo "Deployer:          $DEPLOYER_ADDRESS"
echo "Authorized signer: $AUTHORIZED_SIGNER"
echo "Metadata URI:      $ARCADE_BASE_URI"
echo
read -r -p "Continue with deployment? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Deployment cancelled."
  exit 0
fi

cd "$ROOT_DIR"

FORGE_ARGS=(
  script/DeployAndSeed.s.sol:DeployAndSeed
  --rpc-url "$RPC_ALIAS"
  --broadcast
  --slow
  --batch-size 1
)

if [[ "$RESUME" -eq 1 ]]; then
  FORGE_ARGS+=(--resume)
fi

if [[ -n "$GAS_PRICE" ]]; then
  FORGE_ARGS+=(--legacy --with-gas-price "$GAS_PRICE")
fi

if [[ "$VERIFY" -eq 1 ]]; then
  FORGE_ARGS+=(--verify --etherscan-api-key "$CELOSCAN_API_KEY")
fi

forge script "${FORGE_ARGS[@]}"

echo
echo "Deployment complete. Review broadcast logs under broadcast/DeployAndSeed.s.sol/$CHAIN_ID/"
echo "Encrypted key preserved at $KEY_FILE"
