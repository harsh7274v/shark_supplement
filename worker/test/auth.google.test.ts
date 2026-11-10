import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { verifyToken } from "../src/lib/jwt";

const db = env.DB;

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const CLIENT_SECRET = "test-client-secret";
/** The origin the worker is reached on; it ends up in the redirect uri. */
const ORIGIN = "https://api.example.com";

/**
 * The bindings of a configured Google sign-in. The shared test bindings plus
 * the two Google secrets.
 */
function googleEnv() {
  return {
    DB: env.DB,
    IMAGES: env.IMAGES,
    JWT_SECRET: env.JWT_SECRET,
    FRONTEND_ORIGIN: env.FRONTEND_ORIGIN,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
  };
}

/** The bindings of an installation without Google sign-in. */
function plainEnv() {
  return {
    DB: env.DB,
    IMAGES: env.IMAGES,
    JWT_SECRET: env.JWT_SECRET,
    FRONTEND_ORIGIN: env.FRONTEND_ORIGIN,
  };
}

/** A fresh email per test: the database is shared by the whole suite. */
function uniqueEmail(): string {
  return `google-${crypto.randomUUID()}@example.com`;
}

/** A fake Google id token; its signature is never checked. */
function fakeIdToken(claims: Record<string, unknown>): string {
  const segment = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${segment({ alg: "none", typ: "JWT" })}.${segment(claims)}.signature`;
}

/** The claims Google sends for a signed in customer. */
function googleClaims(email: string, overrides: Record<string, unknown> = {}) {
  return {
    sub: `google-sub-${crypto.randomUUID()}`,
    email,
    email_verified: true,
    name: "Asha Google",
    picture: "https://lh3.googleusercontent.com/a/photo",
    ...overrides,
  };
}

/** Answers the token endpoint of Google with the given id token. */
function mockGoogleToken(idToken: string) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== "https://oauth2.googleapis.com/token") {
      throw new Error(`Unexpected request: ${url}`);
    }
    return new Response(
      JSON.stringify({
        id_token: idToken,
        access_token: "google-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
}

/** Answers the token endpoint of Google with an error. */
function mockGoogleFailure() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
  );
}

/** Every `Set-Cookie` header of a response. */
function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

/** The raw value of a cookie. */
function cookieValue(res: Response, name: string): string | undefined {
  const cookie = setCookies(res).find((entry) => entry.startsWith(`${name}=`));
  return cookie?.split(";")[0]?.slice(name.length + 1);
}

/** Starts the sign-in and returns the state it handed to Google. */
async function startSignIn(bindings = googleEnv()) {
  const res = await app.request(`${ORIGIN}/api/auth/google/start`, {}, bindings);
  const location = new URL(res.headers.get("location") ?? "");
  return {
    res,
    location,
    state: location.searchParams.get("state") ?? "",
    stateCookie: cookieValue(res, "oauth_state"),
  };
}

/** Finishes the sign-in with the code Google handed back. */
async function completeSignIn(options: {
  code: string;
  state?: string;
  stateCookie?: string;
  bindings?: ReturnType<typeof googleEnv>;
}) {
  const query = new URLSearchParams({ code: options.code });
  if (options.state !== undefined) {
    query.set("state", options.state);
  }
  const headers: Record<string, string> = {};
  if (options.stateCookie !== undefined) {
    headers.Cookie = `oauth_state=${options.stateCookie}`;
  }
  return app.request(
    `${ORIGIN}/api/auth/google/callback?${query.toString()}`,
    { headers },
    options.bindings ?? googleEnv(),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("google sign-in", () => {
  describe("start", () => {
    it("answers 501 when the Google client id is not configured", async () => {
      const res = await app.request(
        `${ORIGIN}/api/auth/google/start`,
        {},
        plainEnv(),
      );

      expect(res.status).toBe(501);
      expect(await res.json()).toEqual({ detail: "Google sign-in not configured" });
    });

    it("redirects to the Google consent screen", async () => {
      const { res, location, state } = await startSignIn();

      expect(res.status).toBe(302);
      expect(location.origin + location.pathname).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(location.searchParams.get("redirect_uri")).toBe(
        `${ORIGIN}/api/auth/google/callback`,
      );
      expect(location.searchParams.get("scope")).toBe("openid email profile");
      expect(location.searchParams.get("response_type")).toBe("code");
      expect(location.searchParams.get("access_type")).toBe("offline");
      expect(state).toMatch(/^[0-9a-f]{64}$/);
      expect(location.search).toContain("scope=openid%20email%20profile");
    });

    it("keeps the state in a cookie the callback can check", async () => {
      const { res, state, stateCookie } = await startSignIn();

      expect(stateCookie).toBe(state);
      const cookie = setCookies(res).find((entry) => entry.startsWith("oauth_state="));
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=None");
      expect(cookie).toContain("Path=/");
    });

    it("gives every sign-in its own state", async () => {
      const first = await startSignIn();
      const second = await startSignIn();

      expect(first.state).not.toBe(second.state);
    });
  });

  describe("callback", () => {
    it("signs the customer in and sends them back to the storefront", async () => {
      const email = uniqueEmail();
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(email))));

      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "google-code", state, stateCookie });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        `${env.FRONTEND_ORIGIN}/auth/callback?login=success`,
      );
    });

    it("sets the session cookie and the access cookie", async () => {
      const email = uniqueEmail();
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(email))));

      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "google-code", state, stateCookie });

      const session = setCookies(res).find((entry) => entry.startsWith("session_token="));
      expect(session).toBeDefined();
      expect(session).toContain("Max-Age=604800");
      expect(session).toContain("HttpOnly");
      expect(session).toContain("Secure");
      expect(session).toContain("SameSite=None");
      expect(session).toContain("Path=/");

      const access = setCookies(res).find((entry) => entry.startsWith("access_token="));
      expect(access).toBeDefined();
      expect(access).toContain("Max-Age=900");
      expect(access).toContain("HttpOnly");
      expect(access).toContain("Secure");
      expect(access).toContain("SameSite=None");
      expect(access).toContain("Path=/");
    });

    it("stores the customer with the picture, the google provider and no password", async () => {
      const email = uniqueEmail();
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(email))));

      const { state, stateCookie } = await startSignIn();
      await completeSignIn({ code: "google-code", state, stateCookie });

      const row = await db
        .prepare(
          "SELECT id, email, name, picture, role, auth_provider, password_hash FROM users WHERE email = ?",
        )
        .bind(email)
        .first<{
          id: string;
          email: string;
          name: string;
          picture: string;
          role: string;
          auth_provider: string;
          password_hash: string | null;
        }>();

      expect(row?.email).toBe(email);
      expect(row?.name).toBe("Asha Google");
      expect(row?.picture).toBe("https://lh3.googleusercontent.com/a/photo");
      expect(row?.role).toBe("customer");
      expect(row?.auth_provider).toBe("google");
      expect(row?.password_hash).toBeNull();
    });

    it("writes a session row that expires in seven days", async () => {
      const email = uniqueEmail();
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(email))));

      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "google-code", state, stateCookie });

      const token = cookieValue(res, "session_token");
      const row = await db
        .prepare("SELECT token, user_id, expires_at FROM sessions WHERE token = ?")
        .bind(token ?? "")
        .first<{ token: string; user_id: string; expires_at: string }>();

      expect(row).not.toBeNull();
      const expiresIn = Date.parse(row?.expires_at ?? "") - Date.now();
      expect(expiresIn).toBeGreaterThan(6.9 * 86_400_000);
      expect(expiresIn).toBeLessThanOrEqual(7 * 86_400_000);
    });

    it("gives the customer an access token that opens the protected routes", async () => {
      const email = uniqueEmail();
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(email))));

      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "google-code", state, stateCookie });

      const token = cookieValue(res, "access_token");
      const payload = await verifyToken(token ?? "", "access", env.JWT_SECRET);
      expect(payload?.role).toBe("customer");

      const me = await app.request(
        "/api/auth/me",
        { headers: { Cookie: `access_token=${token ?? ""}` } },
        googleEnv(),
      );
      expect(me.status).toBe(200);
      const body = (await me.json()) as Record<string, unknown>;
      expect(body.email).toBe(email);
      expect(body.user_id).toBe(payload?.sub);
      expect(body.auth_provider).toBe("google");
    });

    it("keeps a single user when the same email signs in again", async () => {
      const email = uniqueEmail();
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(email))));

      const first = await startSignIn();
      const firstRes = await completeSignIn({
        code: "google-code",
        state: first.state,
        stateCookie: first.stateCookie,
      });
      const firstId = (await verifyToken(cookieValue(firstRes, "access_token") ?? "", "access", env.JWT_SECRET))
        ?.sub;

      const second = await startSignIn();
      const secondRes = await completeSignIn({
        code: "google-code",
        state: second.state,
        stateCookie: second.stateCookie,
      });
      const secondId = (await verifyToken(cookieValue(secondRes, "access_token") ?? "", "access", env.JWT_SECRET))
        ?.sub;

      expect(secondRes.status).toBe(302);
      expect(secondId).toBe(firstId);

      const count = await db
        .prepare("SELECT count(*) AS total FROM users WHERE email = ?")
        .bind(email)
        .first<{ total: number }>();
      expect(count?.total).toBe(1);
    });

    it("trades the code for an id token at the token endpoint of Google", async () => {
      const email = uniqueEmail();
      const mocked = mockGoogleToken(fakeIdToken(googleClaims(email)));
      vi.stubGlobal("fetch", mocked);

      const { state, stateCookie } = await startSignIn();
      await completeSignIn({ code: "google-code", state, stateCookie });

      expect(mocked).toHaveBeenCalledTimes(1);
      const [, init] = mocked.mock.calls[0];
      const body = new URLSearchParams(String(init?.body ?? ""));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("google-code");
      expect(body.get("client_id")).toBe(CLIENT_ID);
      expect(body.get("client_secret")).toBe(CLIENT_SECRET);
      expect(body.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
    });

    it("rejects a state that does not belong to the cookie", async () => {
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(uniqueEmail()))));

      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({
        code: "google-code",
        state: "a-forged-state",
        stateCookie,
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Invalid OAuth state" });
    });

    it("rejects a callback without the state cookie", async () => {
      const res = await app.request(
        `${ORIGIN}/api/auth/google/callback?code=google-code&state=a-state-without-a-cookie`,
        {},
        googleEnv(),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Invalid OAuth state" });
    });

    it("answers 400 without a code", async () => {
      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "", state, stateCookie });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Missing authorization code" });
    });

    it("answers 502 when Google refuses the code", async () => {
      vi.stubGlobal("fetch", mockGoogleFailure());

      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "bad-code", state, stateCookie });

      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ detail: "Google sign-in failed" });
    });

    it("answers 501 when the Google client secret is not configured", async () => {
      const res = await app.request(
        `${ORIGIN}/api/auth/google/callback?code=google-code`,
        {},
        plainEnv(),
      );

      expect(res.status).toBe(501);
      expect(await res.json()).toEqual({ detail: "Google sign-in not configured" });
    });

    it("spends the state, so it cannot be replayed", async () => {
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(uniqueEmail()))));

      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "google-code", state, stateCookie });

      const cleared = setCookies(res).find((entry) => entry.startsWith("oauth_state="));
      expect(cleared).toContain("Max-Age=0");
    });

    it("keeps the role of a customer that already exists", async () => {
      const email = uniqueEmail();
      const registered = await app.request(
        "/api/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Asha Google", email, password: "sup3rsecret" }),
        },
        googleEnv(),
      );
      expect(registered.status).toBe(201);
      const userId = ((await registered.clone().json()) as { user_id: string }).user_id;
      await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(userId).run();

      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(email))));
      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "google-code", state, stateCookie });

      const payload = await verifyToken(
        cookieValue(res, "access_token") ?? "",
        "access",
        env.JWT_SECRET,
      );
      expect(payload?.sub).toBe(userId);
      expect(payload?.role).toBe("admin");
    });

    it("leaves a session the logout of the auth routes can drop", async () => {
      const email = uniqueEmail();
      vi.stubGlobal("fetch", mockGoogleToken(fakeIdToken(googleClaims(email))));

      const { state, stateCookie } = await startSignIn();
      const res = await completeSignIn({ code: "google-code", state, stateCookie });
      const sessionToken = cookieValue(res, "session_token");

      const logout = await app.request(
        "/api/auth/logout",
        {
          method: "POST",
          headers: { Cookie: `session_token=${sessionToken ?? ""}` },
        },
        googleEnv(),
      );
      expect(logout.status).toBe(200);

      const row = await db
        .prepare("SELECT token FROM sessions WHERE token = ?")
        .bind(sessionToken ?? "")
        .first<{ token: string }>();
      expect(row).toBeNull();
    });
  });
});
