import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("GET /api/ returns { ok: true }", async () => {
  const res = await SELF.fetch("https://example.com/api/");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
