/**
 * Direct Google sign-in.
 *
 * `GET /google/start` sends the visitor to the consent screen of Google and
 * `GET /google/callback` trades the code Google handed back for an id token,
 * signs the visitor in, and sends them back to the storefront.
 *
 * Parity with the old `backend/server.py`:
 * - the account is keyed by the email, so a second sign in updates the row
 *   instead of creating a second account;
 * - a `sessions` row is written and the `session_token` cookie carries it;
 * - the cookie flags are `httponly, secure, samesite="none", path="/"`.
 *
 * The id token is read, not verified: it arrives from the token endpoint of
 * Google over TLS, in exchange for a code that only this worker ever saw.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../env";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  SESSION_TOKEN_COOKIE,
  randomHex,
} from "../lib/auth-common";
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, signAccessToken, signRefreshToken } from "../lib/jwt";
import type { UserRow } from "../lib/users";
import { findUserByEmail } from "../lib/users";

type GoogleEnv = { Bindings: Env };
type GoogleContext = Context<GoogleEnv>;

export const googleAuthRoutes = new Hono<GoogleEnv>();

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** The path the callback of this worker answers on. */
const CALLBACK_PATH = "/api/auth/google/callback";

/** Carries the random state of the sign-in between the two hops. */
const STATE_COOKIE = "oauth_state";

/** Lifetime of the session row and of the `session_token` cookie, in seconds. */
const SESSION_TTL = 604_800;
/** Lifetime of the state cookie, in seconds. */
const STATE_TTL = 600;

const NOT_CONFIGURED = "Google sign-in not configured";
const INVALID_STATE = "Invalid OAuth state";
const MISSING_CODE = "Missing authorization code";
const SIGN_IN_FAILED = "Google sign-in failed";

/**
 * The claims of the id token of Google. `sub` and `email_verified` are read
 * for completeness; the email is the key of the account.
 */
interface GoogleClaims {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

/** The customer the sign-in belongs to. */
interface GoogleUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: string;
}

/** A claim that is only kept when it is a non empty string. */
function textClaim(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Reads the claims of a JSON web token. The signature is not checked, the
 * token comes from the token endpoint of Google over TLS.
 */
function decodeJwtClaims(token: string): GoogleClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("malformed id_token");
  }

  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));

  if (typeof claims !== "object" || claims === null || Array.isArray(claims)) {
    throw new Error("malformed id_token claims");
  }
  return claims as GoogleClaims;
}

/** The origin the request came in on; it ends up in the redirect uri. */
function requestOrigin(c: GoogleContext): string {
  return new URL(c.req.url).origin;
}

/** The redirect uri of this worker, as it is registered with Google. */
function redirectUri(c: GoogleContext): string {
  return `${requestOrigin(c)}${CALLBACK_PATH}`;
}

/**
 * Creates the customer, or updates the one that already carries the email.
 * The role of an existing customer is left alone, so an admin stays an admin.
 */
async function upsertGoogleUser(
  db: D1Database,
  profile: { email: string; name: string | null; picture: string | null },
): Promise<GoogleUser> {
  const existing = await findUserByEmail(db, profile.email);
  if (existing) {
    return updateGoogleUser(db, existing, profile);
  }

  const id = `user_${randomHex(6)}`;
  try {
    await db
      .prepare(
        `INSERT INTO users (id, email, name, picture, password_hash, role, auth_provider)
         VALUES (?, ?, ?, ?, NULL, 'customer', 'google')`,
      )
      .bind(id, profile.email, profile.name, profile.picture)
      .run();
  } catch (error) {
    // Two sign-ins of the same new email can race past the lookup above.
    if (!String(error).includes("UNIQUE constraint failed")) {
      throw error;
    }
    const raced = await findUserByEmail(db, profile.email);
    if (!raced) {
      throw error;
    }
    return updateGoogleUser(db, raced, profile);
  }

  return {
    id,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    role: "customer",
  };
}

/** Refreshes the profile of a customer that signs in again. */
async function updateGoogleUser(
  db: D1Database,
  user: UserRow,
  profile: { name: string | null; picture: string | null },
): Promise<GoogleUser> {
  const name = profile.name ?? user.name;
  const picture = profile.picture ?? user.picture;
  await db
    .prepare("UPDATE users SET name = ?, picture = ?, auth_provider = 'google' WHERE id = ?")
    .bind(name, picture, user.id)
    .run();
  return { id: user.id, email: user.email, name, picture, role: user.role };
}

/** Trades the code of Google for the claims of the signed in customer. */
async function exchangeCodeForClaims(options: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleClaims> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
  }).toString();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`the token endpoint of Google answered ${response.status}`);
  }

  const payload = (await response.json()) as { id_token?: unknown };
  if (typeof payload.id_token !== "string" || !payload.id_token) {
    throw new Error("the token endpoint of Google sent no id_token");
  }

  return decodeJwtClaims(payload.id_token);
}

googleAuthRoutes.get("/start", async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ detail: NOT_CONFIGURED }, 501);
  }

  // The state ties the answer of Google to the sign-in that started here.
  const state = randomHex(32);
  setCookie(c, STATE_COOKIE, state, { ...AUTH_COOKIE_OPTIONS, maxAge: STATE_TTL });

  const consentUrl =
    `${GOOGLE_AUTHORIZE_URL}?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri(c))}` +
    "&scope=openid%20email%20profile" +
    "&response_type=code" +
    `&state=${encodeURIComponent(state)}` +
    "&access_type=offline";

  return c.redirect(consentUrl, 302);
});

googleAuthRoutes.get("/callback", async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return c.json({ detail: NOT_CONFIGURED }, 501);
  }

  // The state ties the answer of Google to the sign-in that started here, so
  // the cookie of our own start endpoint is required: without it the answer
  // cannot belong to a sign-in of this browser.
  const expectedState = getCookie(c, STATE_COOKIE);
  const receivedState = c.req.query("state");
  if (!expectedState || !receivedState || receivedState !== expectedState) {
    return c.json({ detail: INVALID_STATE }, 400);
  }

  if (c.req.query("error")) {
    return c.json({ detail: SIGN_IN_FAILED }, 400);
  }

  const code = c.req.query("code");
  if (!code) {
    return c.json({ detail: MISSING_CODE }, 400);
  }

  let claims: GoogleClaims;
  try {
    claims = await exchangeCodeForClaims({
      code,
      clientId,
      clientSecret,
      redirectUri: redirectUri(c),
    });
  } catch {
    return c.json({ detail: SIGN_IN_FAILED }, 502);
  }

  // The email is the key of the account. Google only issues an id token for
  // an account it has verified, so the `email_verified` claim is read but not
  // enforced.
  const email = (textClaim(claims.email) ?? "").toLowerCase();
  if (!email) {
    return c.json({ detail: SIGN_IN_FAILED }, 502);
  }

  const user = await upsertGoogleUser(c.env.DB, {
    email,
    name: textClaim(claims.name),
    picture: textClaim(claims.picture),
  });

  // The session row backs the `session_token` cookie of the customer.
  const sessionToken = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString();
  await c.env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionToken, user.id, expiresAt)
    .run();

  setCookie(c, SESSION_TOKEN_COOKIE, sessionToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: SESSION_TTL,
  });

  // The access token opens the protected routes, the refresh token keeps the
  // customer signed in once the access token has expired.
  const accessToken = await signAccessToken({ sub: user.id, role: user.role }, c.env.JWT_SECRET);
  setCookie(c, ACCESS_TOKEN_COOKIE, accessToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_TTL,
  });

  const refreshToken = await signRefreshToken({ sub: user.id, role: user.role }, c.env.JWT_SECRET);
  setCookie(c, REFRESH_TOKEN_COOKIE, refreshToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_TTL,
  });

  // The state is spent, so it cannot be replayed.
  deleteCookie(c, STATE_COOKIE, AUTH_COOKIE_OPTIONS);

  return c.redirect(`${c.env.FRONTEND_ORIGIN}/auth/callback?login=success`, 302);
});
