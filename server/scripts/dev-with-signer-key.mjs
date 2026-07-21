#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';

const SERVER_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DEFAULT_KEY_FILE = path.resolve(SERVER_DIR, process.env.SIGNER_ENCRYPTED_KEY_FILE || '../.keys/signer.dev.key.enc');
const INIT_ONLY = process.argv.includes('--init-only');

function normalizePrivateKey(raw) {
  let key = raw.trim();
  if (!key.startsWith('0x')) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('private key must be 32-byte hex, with or without 0x');
  }
  return key;
}

async function promptHidden(rl, prompt) {
  output.write(prompt);
  const originalWrite = output.write;
  output.write = () => true;
  try {
    return await rl.question('');
  } finally {
    output.write = originalWrite;
    output.write('\n');
  }
}

function encryptPrivateKey(privateKey, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  return JSON.stringify(
    {
      v: 1,
      kdf: 'scrypt',
      cipher: 'aes-256-gcm',
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      ciphertext: ciphertext.toString('hex'),
    },
    null,
    2,
  );
}

function decryptPrivateKey(encrypted, password) {
  const parsed = JSON.parse(encrypted);
  if (parsed.v !== 1 || parsed.cipher !== 'aes-256-gcm' || parsed.kdf !== 'scrypt') {
    throw new Error('unsupported encrypted signer key format');
  }
  const key = crypto.scryptSync(password, Buffer.from(parsed.salt, 'hex'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
  return normalizePrivateKey(Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, 'hex')), decipher.final()]).toString('utf8'));
}

async function loadSignerKey() {
  const rl = readline.createInterface({ input, output });
  try {
    if (process.env.SIGNER_PRIVATE_KEY) {
      return normalizePrivateKey(process.env.SIGNER_PRIVATE_KEY);
    }

    if (!fs.existsSync(DEFAULT_KEY_FILE)) {
      fs.mkdirSync(path.dirname(DEFAULT_KEY_FILE), { recursive: true, mode: 0o700 });
      console.log(`No encrypted signer key found at ${DEFAULT_KEY_FILE}`);
      const rawKey = await promptHidden(rl, 'Signer private key (hidden, will be encrypted): ');
      const privateKey = normalizePrivateKey(rawKey);
      const pass1 = await promptHidden(rl, 'New signer key password: ');
      const pass2 = await promptHidden(rl, 'Confirm signer key password: ');
      if (!pass1 || pass1 !== pass2) throw new Error('passwords are empty or do not match');
      fs.writeFileSync(DEFAULT_KEY_FILE, encryptPrivateKey(privateKey, pass1), { mode: 0o600 });
      console.log(`Encrypted signer key saved to ${DEFAULT_KEY_FILE}`);
      return privateKey;
    }

    const password = await promptHidden(rl, `Password for ${DEFAULT_KEY_FILE}: `);
    return decryptPrivateKey(fs.readFileSync(DEFAULT_KEY_FILE, 'utf8'), password);
  } finally {
    rl.close();
  }
}

async function main() {
  const privateKey = await loadSignerKey();
  if (INIT_ONLY) {
    console.log(`Signer key is ready at ${DEFAULT_KEY_FILE}`);
    return;
  }

  const child = spawn(process.execPath, ['--env-file', '.env', '--import', 'tsx/esm', '--watch', 'src/index.ts'], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'development',
      SIGNER_PRIVATE_KEY: privateKey,
    },
  });

  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

main().catch((err) => {
  console.error(`Signer key loader failed: ${err?.message || err}`);
  process.exit(1);
});
