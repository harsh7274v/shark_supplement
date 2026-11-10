import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { signAccessToken, signRefreshToken, verifyToken } from "../src/lib/jwt";
import { getOptionalUser, requireAdmin, requireAuth } from "../src/middleware/auth";

const SECRET = "jwt-unit-test-secret";
const OTHER_SECRET = "attacker-secret";

/** The middleware reads the secret from the request env, so it is faked here. */
const testEnv: Env = {
  DB: env.DB,
  IMAGES: env.IMAGES,
  JWT_SECRET: SECRET,
  FRONTEND_ORIGIN: "http://localhost:3000",
};

describe("jwt", () => {
  it("round-trips an access token", async () => {
    const token = await signAccessToken({ sub: "user_1", role: "customer" }, SECRET);

    const payload = await verifyToken(token, "access", SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user_1");
    expect(payload?.role).toBe("customer");
    expect(payload?.type).toBe("access");
  });

  it("round-trips a refresh token", async () => {
    const token = await signRefreshToken({ sub: "user_1", role: "customer" }, SECRET);

    const payload = await verifyToken(token, "refresh", SECRET);
    expect(payload?.sub).toBe("user_1");
    expect(payload?.type).toBe("refresh");
  });

  it("expires access tokens after 900s and refresh tokens after 604800s", async () => {
    const access = await verifyToken(
      await signAccessToken({ sub: "user_1", role: "customer" }, SECRET),
      "access",
      SECRET,
    );
    const refresh = await verifyToken(
      await signRefreshToken({ sub: "user_1", role: "customer" }, SECRET),
      "refresh",
      SECRET,
    );

    expect((access?.exp ?? 0) - (access?.iat ?? 0)).toBe(900);
    expect((refresh?.exp ?? 0) - (refresh?.iat ?? 0)).toBe(604800);
  });

  it("rejects an access token where a refresh token is expected", async () => {
    const token = await signAccessToken({ sub: "user_1", role: "customer" }, SECRET);

    expect(await verifyToken(token, "refresh", SECRET)).toBeNull();
  });

  it("rejects a refresh token where an access token is expected", async () => {
    const token = await signRefreshToken({ sub: "user_1", role: "customer" }, SECRET);

    expect(await verifyToken(token, "access", SECRET)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const forged = await sign(
      { sub: "admin_1", role: "admin", type: "access" },
      OTHER_SECRET,
      "HS256",
    );

    expect(await verifyToken(forged, "access", SECRET)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await sign(
      { sub: "user_1", role: "customer", type: "access", iat: now - 100, exp: now - 10 },
      SECRET,
      "HS256",
    );

    expect(await verifyToken(expired, "access", SECRET)).toBeNull();
  });

  it("rejects a token that is not a jwt", async () => {
    expect(await verifyToken("not-a-token", "access", SECRET)).toBeNull();
  });
});

describe("auth middleware", () => {
  const app = new Hono<{ Bindings: Env }>();
  app.get("/protected", requireAuth, (c) => c.json({ ok: true }));
  app.get("/admin", requireAdmin, (c) => c.json({ ok: true }));
  app.get("/whoami", async (c) => c.json(await getOptionalUser(c)));

  it("answers 401 when no token is sent", async () => {
    const res = await app.request("/protected", undefined, testEnv);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: "Not authenticated" });
  });

  it("accepts an access token from the access_token cookie", async () => {
    const token = await signAccessToken({ sub: "user_1", role: "customer" }, SECRET);

    const res = await app.request(
      "/protected",
      { headers: { Cookie: `access_token=${token}` } },
      testEnv,
    );
    expect(res.status).toBe(200);
  });

  it("accepts an access token from the Authorization header", async () => {
    const token = await signAccessToken({ sub: "user_1", role: "customer" }, SECRET);

    const res = await app.request(
      "/protected",
      { headers: { Authorization: `Bearer ${token}` } },
      testEnv,
    );
    expect(res.status).toBe(200);
  });

  it("rejects a refresh token used as an access token", async () => {
    const token = await signRefreshToken({ sub: "user_1", role: "customer" }, SECRET);

    const res = await app.request(
      "/protected",
      { headers: { Cookie: `access_token=${token}` } },
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it("answers 403 for a customer on an admin route", async () => {
    const token = await signAccessToken({ sub: "user_1", role: "customer" }, SECRET);

    const res = await app.request(
      "/admin",
      { headers: { Cookie: `access_token=${token}` } },
      testEnv,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ detail: "Admin access required" });
  });

  it("lets an admin through", async () => {
    const token = await signAccessToken({ sub: "admin_1", role: "admin" }, SECRET);

    const res = await app.request(
      "/admin",
      { headers: { Cookie: `access_token=${token}` } },
      testEnv,
    );
    expect(res.status).toBe(200);
  });

  it("reports the caller identity for a valid token", async () => {
    const token = await signAccessToken({ sub: "user_1", role: "customer" }, SECRET);

    const res = await app.request(
      "/whoami",
      { headers: { Cookie: `access_token=${token}` } },
      testEnv,
    );
    expect(await res.json()).toEqual({ user_id: "user_1", role: "customer" });
  });

  it("reports no identity without a token", async () => {
    const res = await app.request("/whoami", undefined, testEnv);

    expect(await res.json()).toBeNull();
  });
});
