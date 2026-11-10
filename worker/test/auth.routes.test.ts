import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { verifyToken } from "../src/lib/jwt";

const db = env.DB;

/** The client address the login lockout keys on (parity with the old API). */
const CLIENT_IP = "203.0.113.7";

/** The lockout identifier of an email, as the login route builds it. */
function identifierFor(email: string): string {
  return `${CLIENT_IP}:${email}`;
}

/**
 * A fresh email per test: the D1 database is shared by every test in the
 * suite, so a fixed address would collide with the rows of an earlier test.
 */
function uniqueEmail(): string {
  return `user-${crypto.randomUUID()}@example.com`;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": CLIENT_IP,
        ...headers,
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

function get(path: string, headers: Record<string, string> = {}) {
  return app.request(path, { headers }, env);
}

/** Every `Set-Cookie` header of a response. */
function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

/** The `name=value` pair of a cookie, ready to be sent back as a header. */
function cookieHeader(res: Response, name: string): string | undefined {
  return setCookies(res).find((cookie) => cookie.startsWith(`${name}=`))?.split(";")[0];
}

/** The raw value of a cookie. */
function cookieValue(res: Response, name: string): string | undefined {
  return cookieHeader(res, name)?.slice(name.length + 1);
}

async function register(email: string, password = "correctpass") {
  const res = await post("/api/auth/register", { name: "Test Runner", email, password });
  expect(res.status).toBe(201);
  return res;
}

describe("auth routes", () => {
  describe("register", () => {
    it("registers a customer and sets the auth cookies", async () => {
      const email = uniqueEmail();

      const res = await post("/api/auth/register", {
        name: "Asha Runner",
        email,
        password: "sup3rsecret",
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        user_id: expect.stringMatching(/^user_[0-9a-f]{12}$/),
        name: "Asha Runner",
        email,
        picture: null,
        role: "customer",
        auth_provider: "password",
      });

      const access = setCookies(res).find((cookie) => cookie.startsWith("access_token="));
      expect(access).toBeDefined();
      expect(access).toContain("Max-Age=900");
      expect(access).toContain("HttpOnly");
      expect(access).toContain("Secure");
      expect(access).toContain("SameSite=None");
      expect(access).toContain("Path=/");

      const refresh = setCookies(res).find((cookie) => cookie.startsWith("refresh_token="));
      expect(refresh).toBeDefined();
      expect(refresh).toContain("Max-Age=604800");
      expect(refresh).toContain("HttpOnly");
      expect(refresh).toContain("Secure");
      expect(refresh).toContain("SameSite=None");
      expect(refresh).toContain("Path=/");
    });

    it("stores the user with a hashed password and the customer role", async () => {
      const email = uniqueEmail();

      await register(email, "sup3rsecret");

      const row = await db
        .prepare("SELECT id, email, name, role, auth_provider, password_hash FROM users WHERE email = ?")
        .bind(email)
        .first<{
          id: string;
          email: string;
          name: string;
          role: string;
          auth_provider: string;
          password_hash: string;
        }>();

      expect(row?.name).toBe("Test Runner");
      expect(row?.role).toBe("customer");
      expect(row?.auth_provider).toBe("password");
      expect(row?.password_hash).toMatch(/^pbkdf2\$100000\$/);
      expect(row?.password_hash).not.toContain("sup3rsecret");
    });

    it("rejects a duplicate email with 409", async () => {
      const email = uniqueEmail();

      await register(email);
      const res = await post("/api/auth/register", {
        name: "Test Runner",
        email,
        password: "correctpass",
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ detail: "Email already registered" });
    });

    it("rejects a name outside 1..80 characters", async () => {
      const tooLong = await post("/api/auth/register", {
        name: "n".repeat(81),
        email: uniqueEmail(),
        password: "correctpass",
      });
      expect(tooLong.status).toBe(400);

      const empty = await post("/api/auth/register", {
        name: "   ",
        email: uniqueEmail(),
        password: "correctpass",
      });
      expect(empty.status).toBe(400);
    });

    it("rejects a password outside 6..100 characters", async () => {
      const tooShort = await post("/api/auth/register", {
        name: "Test Runner",
        email: uniqueEmail(),
        password: "12345",
      });
      expect(tooShort.status).toBe(400);

      const tooLong = await post("/api/auth/register", {
        name: "Test Runner",
        email: uniqueEmail(),
        password: "p".repeat(101),
      });
      expect(tooLong.status).toBe(400);
    });
  });

  describe("the register, login and me flow", () => {
    it("carries the same customer through register, login and me", async () => {
      const email = uniqueEmail();

      const registered = await register(email);
      const registeredBody = (await registered.clone().json()) as { user_id: string };
      expect(registeredBody.user_id).toMatch(/^user_[0-9a-f]{12}$/);

      const loggedIn = await post("/api/auth/login", { email, password: "correctpass" });
      expect(loggedIn.status).toBe(200);
      expect(await loggedIn.json()).toEqual({
        user_id: registeredBody.user_id,
        name: "Test Runner",
        email,
        picture: null,
        role: "customer",
        auth_provider: "password",
      });

      const me = await get("/api/auth/me", {
        Cookie: cookieHeader(loggedIn, "access_token") ?? "",
      });
      expect(me.status).toBe(200);
      expect(await me.json()).toEqual({
        user_id: registeredBody.user_id,
        name: "Test Runner",
        email,
        picture: null,
        role: "customer",
        auth_provider: "password",
      });
    });
  });

  describe("login", () => {
    it("logs a customer in and sets the auth cookies", async () => {
      const email = uniqueEmail();
      await register(email);

      const res = await post("/api/auth/login", { email, password: "correctpass" });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        user_id: expect.stringMatching(/^user_[0-9a-f]{12}$/),
        name: "Test Runner",
        email,
        picture: null,
        role: "customer",
        auth_provider: "password",
      });

      const access = setCookies(res).find((cookie) => cookie.startsWith("access_token="));
      expect(access).toContain("Max-Age=900");
      expect(access).toContain("HttpOnly");
      expect(access).toContain("Secure");
      expect(access).toContain("SameSite=None");
      expect(access).toContain("Path=/");

      const refresh = setCookies(res).find((cookie) => cookie.startsWith("refresh_token="));
      expect(refresh).toContain("Max-Age=604800");
    });

    it("logs in with the email in a different case", async () => {
      const email = uniqueEmail();
      await register(email);

      const res = await post("/api/auth/login", {
        email: email.toUpperCase(),
        password: "correctpass",
      });

      expect(res.status).toBe(200);
      expect((await res.json()) as { email: string }).toMatchObject({ email });
    });

    it("rejects a wrong password with 401 and counts the failure", async () => {
      const email = uniqueEmail();
      await register(email);

      const res = await post("/api/auth/login", { email, password: "wrongpass" });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Invalid email or password" });

      const attempt = await db
        .prepare("SELECT count FROM login_attempts WHERE identifier = ?")
        .bind(identifierFor(email))
        .first<{ count: number }>();
      expect(attempt?.count).toBe(1);
    });

    it("locks the identifier after 4 failed logins and answers 429 with the right password", async () => {
      const email = uniqueEmail();
      await register(email);

      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await post("/api/auth/login", { email, password: "wrongpass" });
        expect(res.status).toBe(401);
      }

      const locked = await post("/api/auth/login", { email, password: "correctpass" });
      expect(locked.status).toBe(429);
      expect(await locked.json()).toEqual({
        detail: "Too many failed attempts. Try again in 15 minutes",
      });

      const attempt = await db
        .prepare("SELECT count, locked_until FROM login_attempts WHERE identifier = ?")
        .bind(identifierFor(email))
        .first<{ count: number; locked_until: string | null }>();
      expect(attempt?.count).toBe(4);
      const lockedUntil = Date.parse(attempt?.locked_until ?? "");
      expect(lockedUntil).toBeGreaterThan(Date.now());
      expect(lockedUntil).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
    });

    it("deletes the attempt row after a successful login", async () => {
      const email = uniqueEmail();
      await register(email);

      await post("/api/auth/login", { email, password: "wrongpass" });
      const res = await post("/api/auth/login", { email, password: "correctpass" });
      expect(res.status).toBe(200);

      const attempt = await db
        .prepare("SELECT count FROM login_attempts WHERE identifier = ?")
        .bind(identifierFor(email))
        .first<{ count: number }>();
      expect(attempt).toBeNull();
    });
  });

  describe("logout", () => {
    it("clears the cookies and deletes the session row", async () => {
      const email = uniqueEmail();
      const registered = await register(email);
      const userId = (await registered.clone().json()) as { user_id: string };
      const sessionToken = `session_${crypto.randomUUID()}`;
      await db
        .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(sessionToken, userId.user_id, new Date(Date.now() + 7 * 86_400_000).toISOString())
        .run();

      const res = await post(
        "/api/auth/logout",
        {},
        {
          Cookie: [
            cookieHeader(registered, "access_token"),
            `session_token=${sessionToken}`,
          ].join("; "),
        },
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      const cleared = setCookies(res).find((cookie) => cookie.startsWith("access_token="));
      expect(cleared).toContain("Max-Age=0");
      expect(setCookies(res).find((cookie) => cookie.startsWith("refresh_token="))).toContain(
        "Max-Age=0",
      );

      const session = await db
        .prepare("SELECT token FROM sessions WHERE token = ?")
        .bind(sessionToken)
        .first<{ token: string }>();
      expect(session).toBeNull();
    });
  });

  describe("me", () => {
    it("returns the user of the access token without the password hash", async () => {
      const email = uniqueEmail();
      const registered = await register(email);

      const res = await get("/api/auth/me", {
        Cookie: cookieHeader(registered, "access_token") ?? "",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        "auth_provider",
        "email",
        "name",
        "picture",
        "role",
        "user_id",
      ]);
      expect(body).not.toHaveProperty("password_hash");
      expect(body.email).toBe(email);
      expect(body.role).toBe("customer");
    });

    it("answers 401 without an access token", async () => {
      const res = await get("/api/auth/me");

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Not authenticated" });
    });
  });

  describe("refresh", () => {
    it("issues a new access token from the refresh cookie", async () => {
      const email = uniqueEmail();
      const registered = await register(email);
      const body = (await registered.clone().json()) as { user_id: string };

      const res = await post("/api/auth/refresh", {}, {
        Cookie: cookieHeader(registered, "refresh_token") ?? "",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        user_id: body.user_id,
        name: "Test Runner",
        email,
        picture: null,
        role: "customer",
        auth_provider: "password",
      });

      const access = setCookies(res).find((cookie) => cookie.startsWith("access_token="));
      expect(access).toBeDefined();
      expect(access).toContain("Max-Age=900");
      expect(access).toContain("HttpOnly");
      expect(access).toContain("Secure");
      expect(access).toContain("SameSite=None");
      expect(access).toContain("Path=/");

      const token = cookieValue(res, "access_token");
      const payload = await verifyToken(token ?? "", "access", env.JWT_SECRET);
      expect(payload?.sub).toBe(body.user_id);
    });

    it("takes the role from the user row, not from the refresh token", async () => {
      const email = uniqueEmail();
      const registered = await register(email);
      const body = (await registered.clone().json()) as { user_id: string };

      await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(body.user_id).run();

      const res = await post("/api/auth/refresh", {}, {
        Cookie: cookieHeader(registered, "refresh_token") ?? "",
      });
      expect(res.status).toBe(200);

      const payload = await verifyToken(
        cookieValue(res, "access_token") ?? "",
        "access",
        env.JWT_SECRET,
      );
      expect(payload?.role).toBe("admin");
    });

    it("answers 401 when an access token is sent instead of a refresh token", async () => {
      const registered = await register(uniqueEmail());

      const res = await post("/api/auth/refresh", {}, {
        Cookie: cookieHeader(registered, "access_token") ?? "",
      });

      expect(res.status).toBe(401);
    });

    it("answers 401 without a refresh cookie", async () => {
      const res = await post("/api/auth/refresh", {});

      expect(res.status).toBe(401);
    });
  });

  describe("forgot password", () => {
    it("stores a reset token that expires in an hour", async () => {
      const email = uniqueEmail();

      const res = await post("/api/auth/forgot-password", { email });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { reset_token: string };
      expect(typeof body.reset_token).toBe("string");
      expect(body.reset_token.length).toBeGreaterThanOrEqual(32);

      const row = await db
        .prepare("SELECT token, email, expires_at, used FROM password_resets WHERE token = ?")
        .bind(body.reset_token)
        .first<{ token: string; email: string; expires_at: string; used: number }>();
      expect(row?.email).toBe(email);
      expect(row?.used).toBe(0);

      const expiresIn = Date.parse(row?.expires_at ?? "") - Date.now();
      expect(expiresIn).toBeGreaterThan(59 * 60 * 1000);
      expect(expiresIn).toBeLessThanOrEqual(60 * 60 * 1000);
    });
  });
});
