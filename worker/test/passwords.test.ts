import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/passwords";

describe("hashPassword", () => {
  it("stores the hash as pbkdf2$<iterations>$<salt>$<hash>", async () => {
    const stored = await hashPassword("kinetic-123");

    const parts = stored.split("$");
    expect(parts).toHaveLength(4);

    const [scheme, iterations, salt, hash] = parts;
    expect(scheme).toBe("pbkdf2");
    expect(iterations).toBe("100000");
    // 16 byte salt and a 32 byte SHA-256 digest, base64 encoded.
    expect(atob(salt).length).toBe(16);
    expect(atob(hash).length).toBe(32);
  });

  it("salts every hash separately", async () => {
    const [first, second] = await Promise.all([
      hashPassword("kinetic-123"),
      hashPassword("kinetic-123"),
    ]);

    expect(first).not.toBe(second);
    expect(await verifyPassword("kinetic-123", first)).toBe(true);
    expect(await verifyPassword("kinetic-123", second)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("accepts the password the hash was made from", async () => {
    const stored = await hashPassword("kinetic-123");

    expect(await verifyPassword("kinetic-123", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("kinetic-123");

    expect(await verifyPassword("kinetic-124", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("kinetic-123", "not-a-hash")).toBe(false);
    expect(await verifyPassword("kinetic-123", "pbkdf2$100000$not base64$not base64")).toBe(false);
    expect(await verifyPassword("kinetic-123", "pbkdf2$many$AAAA$AAAA")).toBe(false);
    expect(await verifyPassword("kinetic-123", "pbkdf2$999999999$AAAA$AAAA")).toBe(false);
  });
});
