/**
 * The reading of a request body.
 *
 * The auth routes and the order routes both take a JSON body, and both have
 * to answer 400 when the body is not a JSON object, so the reader lives here
 * and is shared.
 */

import type { Context } from "hono";
import type { Env } from "../env";

type HttpEnv = { Bindings: Env };
type HttpContext = Context<HttpEnv>;

/**
 * Reads the body of a request as a JSON object, or `null` when the body is
 * not a JSON object at all.
 */
export async function readJsonBody(c: HttpContext): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
