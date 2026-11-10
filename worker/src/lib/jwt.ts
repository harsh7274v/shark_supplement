/**
 * Access and refresh tokens, signed with `Env.JWT_SECRET`.
 *
 * The secret is passed in instead of read from the environment so that the
 * helpers stay pure and the callers keep control over where the secret comes
 * from (`c.env.JWT_SECRET` inside a request).
 */

import { sign, verify } from "hono/jwt";

/** Lifetime of an access token, in seconds. */
export const ACCESS_TOKEN_TTL = 900;
/** Lifetime of a refresh token, in seconds. */
export const REFRESH_TOKEN_TTL = 604_800;

const ALGORITHM = "HS256";

export type TokenType = "access" | "refresh";

/** The claims that identify the token holder. */
export interface TokenSubject {
  /** The `users.id` of the token holder. */
  sub: string;
  /** `admin` or `customer`. */
  role: string;
}

export interface TokenPayload extends TokenSubject {
  type: TokenType;
  /** Issued at, in seconds since the epoch. */
  iat: number;
  /** Expires at, in seconds since the epoch. */
  exp: number;
}

async function signToken(
  payload: TokenSubject,
  type: TokenType,
  ttl: number,
  secret: string,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return sign(
    { sub: payload.sub, role: payload.role, type, iat, exp: iat + ttl },
    secret,
    ALGORITHM,
  );
}

/** Signs a short lived token used to call the API. */
export function signAccessToken(payload: TokenSubject, secret: string): Promise<string> {
  return signToken(payload, "access", ACCESS_TOKEN_TTL, secret);
}

/** Signs a long lived token used to mint a new access token. */
export function signRefreshToken(payload: TokenSubject, secret: string): Promise<string> {
  return signToken(payload, "refresh", REFRESH_TOKEN_TTL, secret);
}

/**
 * Verifies a token and returns its payload, or `null` when the token is
 * invalid, expired, or of the other type.
 */
export async function verifyToken(
  token: string,
  type: TokenType,
  secret: string,
): Promise<TokenPayload | null> {
  let claims: Record<string, unknown>;
  try {
    claims = await verify(token, secret, ALGORITHM);
  } catch {
    return null;
  }

  const { sub, role, type: tokenType, iat, exp } = claims;
  if (tokenType !== type) {
    return null;
  }
  if (typeof sub !== "string" || typeof role !== "string") {
    return null;
  }
  if (typeof iat !== "number" || typeof exp !== "number") {
    return null;
  }

  return { sub, role, type, iat, exp };
}
