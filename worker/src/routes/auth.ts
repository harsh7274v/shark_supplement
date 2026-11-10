/**
 * Authentication routes: register, login (with the brute force lockout),
 * logout, me, refresh and forgot password.
 *
 * Mounted at `/api/auth` by `src/index.ts`.
 *
 * Parity with the old `backend/server.py`:
 * - the access token lives for 900s, the refresh token for 604800s, and both
 *   travel in `HttpOnly; Secure; SameSite=None; Path=/` cookies;
 * - a login identifier is `<ip>:<email>`, and the fourth failed login locks
 *   that identifier for 15 minutes;
 * - the user JSON is `{user_id, name, email, picture, role, auth_provider}`.
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
import { readJsonBody } from "../lib/http";
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/passwords";
import type { UserRow } from "../lib/users";
import { findUserByEmail } from "../lib/users";
import { getOptionalUser, requireAuth } from "../middleware/auth";
import { googleAuthRoutes } from "./auth.google";

type AuthEnv = { Bindings: Env };
type AuthContext = Context<AuthEnv>;

export const authRoutes = new Hono<AuthEnv>();

// The Google sign-in lives in its own module; it answers on
// `/api/auth/google/start` and `/api/auth/google/callback`.
authRoutes.route("/google", googleAuthRoutes);

/** Failed logins that lock a login identifier. */
const LOCK_THRESHOLD = 4;
/** How long a locked identifier stays locked, in minutes. */
const LOCK_MINUTES = 15;
/** Lifetime of a password reset token, in minutes. */
const RESET_TOKEN_MINUTES = 60;

const NAME_MIN = 1;
const NAME_MAX = 80;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 100;

const LOCKED_MESSAGE = "Too many failed attempts. Try again in 15 minutes";
const INVALID_CREDENTIALS = "Invalid email or password";
const NOT_AUTHENTICATED = "Not authenticated";

/** The user JSON the API answers with; it never carries the password hash. */
function publicUser(row: UserRow) {
  return {
    user_id: row.id,
    name: row.name,
    email: row.email,
    picture: row.picture,
    role: row.role,
    auth_provider: row.auth_provider ?? "password",
  };
}

/** Emails are stored lower cased, so they are looked up that way too. */
function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Reads a timestamp column. Rows written by this module use ISO-8601, rows
 * written by SQL use `datetime('now')`; both are understood.
 */
function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? null : time;
}

/**
 * The identifier the lockout counts: the client address and the email, as in
 * the old API. The address comes from Cloudflare, and is `unknown` locally.
 */
function loginIdentifier(c: AuthContext, email: string): string {
  return `${c.req.header("CF-Connecting-IP") ?? "unknown"}:${email}`;
}

async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db
    .prepare(
      "SELECT id, email, name, picture, role, auth_provider FROM users WHERE id = ?",
    )
    .bind(id)
    .first<UserRow>();
}

async function setAccessCookie(c: AuthContext, userId: string, role: string): Promise<void> {
  const token = await signAccessToken({ sub: userId, role }, c.env.JWT_SECRET);
  setCookie(c, ACCESS_TOKEN_COOKIE, token, { ...AUTH_COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_TTL });
}

async function setRefreshCookie(c: AuthContext, userId: string, role: string): Promise<void> {
  const token = await signRefreshToken({ sub: userId, role }, c.env.JWT_SECRET);
  setCookie(c, REFRESH_TOKEN_COOKIE, token, { ...AUTH_COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_TTL });
}

/** Signs in the caller: a fresh access token and a fresh refresh token. */
async function signIn(c: AuthContext, userId: string, role: string): Promise<void> {
  await setAccessCookie(c, userId, role);
  await setRefreshCookie(c, userId, role);
}

authRoutes.post("/register", async (c) => {
  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: "Invalid request body" }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return c.json(
      { detail: `Name must be between ${NAME_MIN} and ${NAME_MAX} characters` },
      400,
    );
  }
  if (!email) {
    return c.json({ detail: "Email is required" }, 400);
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return c.json(
      { detail: `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters` },
      400,
    );
  }

  if (await findUserByEmail(c.env.DB, email)) {
    return c.json({ detail: "Email already registered" }, 409);
  }

  const userId = `user_${randomHex(6)}`;
  const passwordHash = await hashPassword(password);
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, name, picture, password_hash, role, auth_provider)
       VALUES (?, ?, ?, NULL, ?, 'customer', 'password')`,
    )
      .bind(userId, email, name, passwordHash)
      .run();
  } catch (error) {
    // Two registrations of the same email can race past the check above.
    if (String(error).includes("UNIQUE constraint failed")) {
      return c.json({ detail: "Email already registered" }, 409);
    }
    throw error;
  }

  const user: UserRow = {
    id: userId,
    email,
    name,
    picture: null,
    role: "customer",
    auth_provider: "password",
  };

  await signIn(c, user.id, user.role);
  return c.json(publicUser(user), 201);
});

authRoutes.post("/login", async (c) => {
  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: "Invalid request body" }, 400);
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return c.json({ detail: INVALID_CREDENTIALS }, 401);
  }

  const identifier = loginIdentifier(c, email);
  const attempt = await c.env.DB.prepare(
    "SELECT count, locked_until FROM login_attempts WHERE identifier = ?",
  )
    .bind(identifier)
    .first<{ count: number; locked_until: string | null }>();

  const lockedUntil = parseTimestamp(attempt?.locked_until ?? null);
  if (lockedUntil !== null && lockedUntil > Date.now()) {
    return c.json({ detail: LOCKED_MESSAGE }, 429);
  }

  const user = await findUserByEmail(c.env.DB, email);
  const passwordMatches =
    user?.password_hash != null && (await verifyPassword(password, user.password_hash));

  if (!user || !passwordMatches) {
    await countFailedLogin(c.env.DB, identifier);
    return c.json({ detail: INVALID_CREDENTIALS }, 401);
  }

  await c.env.DB.prepare("DELETE FROM login_attempts WHERE identifier = ?")
    .bind(identifier)
    .run();

  await signIn(c, user.id, user.role);
  return c.json(publicUser(user));
});

/**
 * Counts a failed login and locks the identifier once it reaches the
 * threshold. The lock lasts for `LOCK_MINUTES`.
 */
async function countFailedLogin(db: D1Database, identifier: string): Promise<void> {
  const updated = await db
    .prepare(
      `INSERT INTO login_attempts (identifier, count, locked_until)
       VALUES (?, 1, NULL)
       ON CONFLICT(identifier) DO UPDATE SET count = login_attempts.count + 1
       RETURNING count`,
    )
    .bind(identifier)
    .first<{ count: number }>();

  if ((updated?.count ?? 0) >= LOCK_THRESHOLD) {
    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
    await db.prepare("UPDATE login_attempts SET locked_until = ? WHERE identifier = ?")
      .bind(lockedUntil, identifier)
      .run();
  }
}

authRoutes.post("/logout", async (c) => {
  const sessionToken = getCookie(c, SESSION_TOKEN_COOKIE);
  if (sessionToken) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(sessionToken).run();
  }

  // The sessions of the caller go as well, so a sign in cannot be revived.
  const user = await getOptionalUser(c);
  if (user) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.user_id).run();
  }

  deleteCookie(c, ACCESS_TOKEN_COOKIE, AUTH_COOKIE_OPTIONS);
  deleteCookie(c, REFRESH_TOKEN_COOKIE, AUTH_COOKIE_OPTIONS);
  deleteCookie(c, SESSION_TOKEN_COOKIE, AUTH_COOKIE_OPTIONS);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = await getOptionalUser(c);
  if (!user) {
    return c.json({ detail: NOT_AUTHENTICATED }, 401);
  }

  const row = await findUserById(c.env.DB, user.user_id);
  if (!row) {
    return c.json({ detail: NOT_AUTHENTICATED }, 401);
  }

  return c.json(publicUser(row));
});

authRoutes.post("/refresh", async (c) => {
  const token = getCookie(c, REFRESH_TOKEN_COOKIE);
  if (!token) {
    return c.json({ detail: "No refresh token" }, 401);
  }

  const payload = await verifyToken(token, "refresh", c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ detail: "Invalid refresh token" }, 401);
  }

  // The role is read from the user row, so a role change takes effect here.
  const user = await findUserById(c.env.DB, payload.sub);
  if (!user) {
    return c.json({ detail: "Invalid refresh token" }, 401);
  }

  await setAccessCookie(c, user.id, user.role);
  return c.json(publicUser(user));
});

authRoutes.post("/forgot-password", async (c) => {
  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: "Invalid request body" }, 400);
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return c.json({ detail: "Email is required" }, 400);
  }

  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO password_resets (token, email, expires_at, used) VALUES (?, ?, ?, 0)",
  )
    .bind(token, email, expiresAt)
    .run();

  return c.json({ reset_token: token });
});
