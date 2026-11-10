/**
 * The image upload of the admin and the serving of the images.
 *
 * The upload is a multipart form with a `file` field that has to carry an
 * image. The file goes into the R2 bucket under `products/<uuid>.<ext>` and
 * the answer carries the path the image is served on; the same path gives the
 * bytes of the image back.
 */

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

/** A tiny PNG: the eight bytes of the signature and four more. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
]);

/** The biggest file the upload takes, in bytes. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** The name of the field of the form that carries the file. */
const FILE_FIELD = "file";

/** The boundary of the multipart form of the tests. */
const BOUNDARY = "----kineticUploadsBoundary";

/** An access token of an admin. */
async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "admin_uploads", role: "admin" }, env.JWT_SECRET);
}

/** An access token of a customer. */
async function customerToken(): Promise<string> {
  return signAccessToken({ sub: "user_uploads", role: "customer" }, env.JWT_SECRET);
}

/**
 * Builds the body of a multipart form with one file in it.
 *
 * The form is built by hand and not with `FormData`, so the test knows the
 * length of the body it sends and can send a `Content-Length` of its own.
 */
function multipartBody(
  bytes: Uint8Array,
  contentType: string,
  field: string = FILE_FIELD,
): { body: Uint8Array; contentType: string } {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="${field}"; filename="picture.png"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${BOUNDARY}--\r\n`);

  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  return { body, contentType: `multipart/form-data; boundary=${BOUNDARY}` };
}

/**
 * Posts a file to the upload of the admin.
 *
 * The body is a multipart form with one field that carries the bytes and the
 * type of the file.
 */
async function upload(
  bytes: Uint8Array,
  contentType: string,
  token?: string,
  field: string = FILE_FIELD,
): Promise<Response> {
  const { body, contentType: formType } = multipartBody(bytes, contentType, field);
  const headers: Record<string, string> = { "Content-Type": formType };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return app.request(
    "/api/admin/uploads",
    { method: "POST", headers, body },
    env,
  );
}

/** The answer of an upload that worked. */
interface UploadJson {
  url: string;
}

/** Uploads a file and reads the path it is served on. */
async function uploadAndGetUrl(bytes: Uint8Array, contentType: string): Promise<string> {
  const res = await upload(bytes, contentType, await adminToken());
  expect(res.status).toBe(200);
  const body = (await res.json()) as UploadJson;
  return body.url;
}

describe("admin image upload", () => {
  it("stores the image and answers with the path it is served on", async () => {
    const res = await upload(PNG_BYTES, "image/png", await adminToken());

    expect(res.status).toBe(200);
    const body = (await res.json()) as UploadJson;
    expect(body.url).toMatch(
      /^\/api\/images\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
  });

  it("gives the extension of the type of the image", async () => {
    const jpeg = await uploadAndGetUrl(PNG_BYTES, "image/jpeg");
    expect(jpeg).toMatch(/\.jpg$/);

    const webp = await uploadAndGetUrl(PNG_BYTES, "image/webp");
    expect(webp).toMatch(/\.webp$/);
  });

  it("takes the type of the file without the parameters of the header", async () => {
    const url = await uploadAndGetUrl(PNG_BYTES, "image/png; charset=binary");
    expect(url).toMatch(/\.png$/);

    const res = await app.request(url, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("serves the image back with the same bytes and the same type", async () => {
    const url = await uploadAndGetUrl(PNG_BYTES, "image/png");

    const res = await app.request(url, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("serves the image so that it cannot run in the origin of the store", async () => {
    const url = await uploadAndGetUrl(PNG_BYTES, "image/png");

    const res = await app.request(url, {}, env);

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
  });

  it("answers 404 for an image that is not there", async () => {
    const res = await app.request("/api/images/products/no-such-image.png", {}, env);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Image not found" });
  });

  it("refuses an upload of a customer", async () => {
    const res = await upload(PNG_BYTES, "image/png", await customerToken());

    expect(res.status).toBe(403);
  });

  it("refuses an upload of a caller without a token", async () => {
    const res = await upload(PNG_BYTES, "image/png");

    expect(res.status).toBe(401);
  });

  it("refuses a file that is not an image", async () => {
    const res = await upload(PNG_BYTES, "text/plain", await adminToken());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "File must be an image" });
  });

  it("refuses a form without a file", async () => {
    const res = await upload(PNG_BYTES, "image/png", await adminToken(), "not-the-file");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "File is required" });
  });

  it("refuses a body that is not a form", async () => {
    const res = await app.request(
      "/api/admin/uploads",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await adminToken()}`,
        },
        body: JSON.stringify({ file: "not a file" }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "Invalid request body" });
  });

  it("refuses a file of eleven megabytes", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);

    const res = await upload(big, "image/png", await adminToken());

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: "File too large" });
  });

  it("refuses a file that is a byte over the limit", async () => {
    const big = new Uint8Array(MAX_FILE_SIZE + 1);

    const res = await upload(big, "image/png", await adminToken());

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: "File too large" });
  });

  it("refuses a body that is too large before it is read", async () => {
    const { body, contentType } = multipartBody(
      new Uint8Array(MAX_FILE_SIZE + 512 * 1024),
      "image/png",
    );

    const res = await app.request(
      "/api/admin/uploads",
      {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(body.length),
          Authorization: `Bearer ${await adminToken()}`,
        },
        body,
      },
      env,
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: "File too large" });
  });
});
