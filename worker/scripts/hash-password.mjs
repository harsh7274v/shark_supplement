/**
 * Generates a PBKDF2-SHA256 password hash in the same format the worker
 * stores: `pbkdf2$100000$<salt base64>$<hash base64>` — 100 000 iterations,
 * a 16 byte salt, a 256 bit key. Same format as `src/lib/passwords.ts`
 * (Task 3), so a hash made here can be pasted straight into the seed SQL
 * and verified by `verifyPassword`.
 *
 * The password is read from the first argument and the hash is printed on
 * stdout, ready to be copied into `worker/seed/001_catalog.sql`.
 *
 *   node scripts/hash-password.mjs <password>
 */

const ALGORITHM = "PBKDF2";
const HASH = "SHA-256";
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const encoder = new TextEncoder();

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function deriveBits(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: ALGORITHM, hash: HASH, salt, iterations: ITERATIONS },
      key,
      KEY_BITS,
    ),
  );
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

void hashPassword(password).then((hash) => {
  console.log(hash);
});
