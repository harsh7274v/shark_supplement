/**
 * The image upload of the admin and the serving of the images.
 *
 * The upload is a multipart form with a `file` field: the file has to be an
 * image and it may not be bigger than ten megabytes. It goes into the R2
 * bucket under `products/<uuid>.<ext>`, and the answer carries the path the
 * image is served on.
 *
 * The images are served by the worker itself, so the bucket does not have to
 * be public: the answer carries the type of the file and a long cache time,
 * because the name of the object has a fresh uuid in it and never changes.
 *
 * Mounted at `/api` by `src/index.ts`, so the routes answer on
 * `/api/admin/uploads` and `/api/images/<key>`.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../env";
import { requireAdmin } from "../middleware/auth";

type UploadsEnv = { Bindings: Env };
type UploadsContext = Context<UploadsEnv>;

export const uploadRoutes = new Hono<UploadsEnv>();

/** The biggest file the upload takes, in bytes. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * The room the envelope of the form gets.
 *
 * The body of the request is bigger than the file in it (the boundary and the
 * headers of the part), so a body that is a bit over the limit is not
 * refused before the file is read: the size of the file itself is the one
 * that counts.
 */
const ENVELOPE_ROOM = 256 * 1024;

/** The folder of the images of the products inside the bucket. */
const IMAGE_FOLDER = "products";

/**
 * The path of the images, below the `/api` the router is mounted at.
 *
 * The answer of the upload carries the path of the image, so the path of the
 * route and the path of the answer are one thing and cannot drift apart.
 */
const IMAGE_PATH = "/images";

/** How long a browser may keep an image. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The name of the field of the form that carries the file. */
const FILE_FIELD = "file";

const INVALID_BODY = "Invalid request body";
const FILE_REQUIRED = "File is required";
const NOT_AN_IMAGE = "File must be an image";
const FILE_TOO_LARGE = "File too large";
const IMAGE_NOT_FOUND = "Image not found";

/** The extension of the file of the image types the store knows. */
const EXTENSIONS = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/svg+xml", "svg"],
  ["image/bmp", "bmp"],
  ["image/tiff", "tif"],
  ["image/x-icon", "ico"],
  ["image/vnd.microsoft.icon", "ico"],
]);

/**
 * The type of a file, without the parameters of the header.
 *
 * The type of a part of a form is what the client wrote in the header of the
 * part, so it may carry parameters (`image/png; charset=binary`). The type
 * alone is what the extension and the type of the answer are made of.
 */
function normalizeType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

/**
 * The extension of the file of an image.
 *
 * The types the store knows have an extension of their own; the other ones
 * get the name of their subtype, so an image the store does not know still
 * lands in the bucket with a name that says what it is.
 */
function extensionOf(contentType: string): string {
  const known = EXTENSIONS.get(contentType);
  if (known) {
    return known;
  }

  const subtype = contentType.slice("image/".length);
  const cleaned = subtype.replace(/[^a-z0-9]/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 8) : "bin";
}

/**
 * The key of an image in the bucket.
 *
 * The name has a fresh uuid in it, so two uploads of the same picture never
 * fight over the same object and the name of an image never changes once it
 * is given out.
 */
function imageKey(contentType: string): string {
  return `${IMAGE_FOLDER}/${crypto.randomUUID()}.${extensionOf(contentType)}`;
}

uploadRoutes.post("/admin/uploads", requireAdmin, async (c: UploadsContext) => {
  // A body that is over the limit is refused before it is read, so a huge
  // upload cannot fill the memory of the worker.
  const length = Number(c.req.header("Content-Length"));
  if (Number.isFinite(length) && length > MAX_FILE_SIZE + ENVELOPE_ROOM) {
    return c.json({ detail: FILE_TOO_LARGE }, 413);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  const entry = form.get(FILE_FIELD);
  if (entry === null || typeof entry === "string") {
    return c.json({ detail: FILE_REQUIRED }, 400);
  }
  const file = entry;
  const contentType = normalizeType(file.type);

  if (!contentType.startsWith("image/")) {
    return c.json({ detail: NOT_AN_IMAGE }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ detail: FILE_TOO_LARGE }, 413);
  }

  const key = imageKey(contentType);
  await c.env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType, cacheControl: CACHE_CONTROL },
  });

  return c.json({ url: `/api${IMAGE_PATH}/${key}` });
});

// The key of an image has a folder in it (`products/<uuid>.png`), so the
// parameter takes the slashes of the path as well.
uploadRoutes.get(`${IMAGE_PATH}/:key{.+}`, async (c: UploadsContext) => {
  const key = c.req.param("key");
  const object = key ? await c.env.IMAGES.get(key) : null;
  if (!object) {
    return c.json({ detail: IMAGE_NOT_FOUND }, 404);
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": CACHE_CONTROL,
      // The bytes of the bucket are not trusted: an image that is really a
      // page with a script in it must not run in the origin of the store
      // when somebody opens its path.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
