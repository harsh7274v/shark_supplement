/**
 * The pieces the auth routes share: the names of the cookies, the flags they
 * carry, and the random ids and tokens.
 *
 * The cookie names are shared on purpose. The Google sign-in writes the
 * `session_token` cookie, and the logout of `routes/auth.ts` has to drop
 * exactly that cookie.
 */

/** The name of the cookie that carries the access token. */
export const ACCESS_TOKEN_COOKIE = "access_token";
/** The name of the cookie that carries the refresh token. */
export const REFRESH_TOKEN_COOKIE = "refresh_token";
/** The name of the cookie that carries the session token. */
export const SESSION_TOKEN_COOKIE = "session_token";

/** The flags every auth cookie carries. */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  path: "/",
} as const;

/** A hexadecimal random string, used for ids and tokens. */
export function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
