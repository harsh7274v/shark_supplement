/**
 * Authentication guards.
 *
 * The caller is identified by the `access_token` cookie, falling back to an
 * `Authorization: Bearer` header. The token is an access token only, so a
 * refresh token never grants access.
 */

import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../env";
import { verifyToken } from "../lib/jwt";

/** The identity of the caller, taken from the verified access token. */
export interface UserPublic {
  /** The `users.id` of the caller. */
  user_id: string;
  /** `admin` or `customer`. */
  role: string;
}

type AuthEnv = { Bindings: Env };
type AuthContext = Context<AuthEnv>;

const ACCESS_TOKEN_COOKIE = "access_token";
const BEARER_PREFIX = "Bearer ";

function readAccessToken(c: AuthContext): string | undefined {
  const cookie = getCookie(c, ACCESS_TOKEN_COOKIE);
  if (cookie) {
    return cookie;
  }

  const header = c.req.header("Authorization");
  if (header?.startsWith(BEARER_PREFIX)) {
    return header.slice(BEARER_PREFIX.length).trim() || undefined;
  }

  return undefined;
}

/**
 * Returns the caller, or `null` when the request carries no valid access
 * token. Handlers behind `requireAuth` use this to read the user id.
 */
export async function getOptionalUser(c: AuthContext): Promise<UserPublic | null> {
  const token = readAccessToken(c);
  if (!token) {
    return null;
  }

  const payload = await verifyToken(token, "access", c.env.JWT_SECRET);
  if (!payload) {
    return null;
  }

  return { user_id: payload.sub, role: payload.role };
}

/** Rejects requests without a valid access token with 401. */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await getOptionalUser(c);
  if (!user) {
    return c.json({ detail: "Not authenticated" }, 401);
  }

  await next();
};

/** Rejects requests without an access token with 401 and non admins with 403. */
export const requireAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await getOptionalUser(c);
  if (!user) {
    return c.json({ detail: "Not authenticated" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ detail: "Admin access required" }, 403);
  }

  await next();
};
