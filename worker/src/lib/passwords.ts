/**
 * Password hashing with PBKDF2-SHA256 from WebCrypto.
 *
 * A stored hash looks like `pbkdf2$100000$<salt base64>$<hash base64>`: the
 * iteration count is part of the string so the cost can be raised later
 * without invalidating the hashes that are already stored.
 */

const ALGORITHM = "PBKDF2";
const HASH = "SHA-256";
const ITERATIONS = 100_000;
/** Guards against a tampered row asking for an absurd amount of work. */
const MAX_ITERATIONS = 1_000_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const encoder = new TextEncoder();

/** Base64 of the raw bytes, as stored in the hash string. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, hash: HASH, salt, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Compares two digests without leaking where they differ. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }
  return difference === 0;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(pw, salt, ITERATIONS);

  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  // `users.password_hash` is nullable, so a caller can hand in nothing.
  if (typeof stored !== "string") {
    return false;
  }

  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }

  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations <= 0 || iterations > MAX_ITERATIONS) {
    return false;
  }

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[2]);
    expected = fromBase64(parts[3]);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const actual = await deriveBits(pw, salt, iterations);
  return equalBytes(actual, expected);
}
