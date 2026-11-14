#!/usr/bin/env node

/**
 * Uploads all images from frontend/public/images/ to Cloudflare R2 bucket `kinetic-images`.
 *
 * Usage:
 *   node scripts/upload-images-to-r2.mjs           # Local miniflare R2 simulation
 *   node scripts/upload-images-to-r2.mjs --remote  # Remote Cloudflare R2 production bucket
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const imagesDir = path.join(rootDir, "frontend/public/images");
const isRemote = process.argv.includes("--remote");

const BUCKET_NAME = "kinetic-images";
const R2_PREFIX = "catalog";

const MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

if (!fs.existsSync(imagesDir)) {
  console.error(`Images directory not found at: ${imagesDir}`);
  process.exit(1);
}

const files = fs.readdirSync(imagesDir).filter((file) => {
  const ext = path.extname(file).toLowerCase();
  return ext in MIME_MAP;
});

console.log(`Found ${files.length} images to sync to R2 (Mode: ${isRemote ? "REMOTE" : "LOCAL"})...`);

if (isRemote) {
  // Remote upload using wrangler CLI
  for (const file of files) {
    const filePath = path.join(imagesDir, file);
    const key = `${R2_PREFIX}/${file}`;
    const mime = MIME_MAP[path.extname(file).toLowerCase()] || "application/octet-stream";
    console.log(`Uploading ${file} -> r2://${BUCKET_NAME}/${key} (${mime})...`);
    try {
      execSync(
        `npx wrangler r2 object put "${BUCKET_NAME}/${key}" --file="${filePath}" --content-type="${mime}" --remote`,
        { stdio: "inherit", cwd: path.resolve(__dirname, "..") }
      );
    } catch (err) {
      console.error(`Failed to upload ${file}:`, err.message);
    }
  }
  console.log("Remote R2 sync completed.");
} else {
  // Local Miniflare R2 upload
  const r2StateDir = path.join(rootDir, "worker/.wrangler/state/v3/r2");
  const miniflareDir = path.join(r2StateDir, "miniflare-R2BucketObject");
  const blobsDir = path.join(r2StateDir, BUCKET_NAME, "blobs");

  fs.mkdirSync(blobsDir, { recursive: true });

  // Locate the SQLite database for the bucket in miniflare-R2BucketObject
  let sqliteDbPath = null;
  if (fs.existsSync(miniflareDir)) {
    const dbFiles = fs.readdirSync(miniflareDir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
    if (dbFiles.length > 0) {
      sqliteDbPath = path.join(miniflareDir, dbFiles[0]);
    }
  }

  if (!sqliteDbPath) {
    console.warn("Local Miniflare R2 SQLite database not found yet. Attempting wrangler CLI...");
    for (const file of files) {
      const filePath = path.join(imagesDir, file);
      const key = `${R2_PREFIX}/${file}`;
      execSync(`npx wrangler r2 object put "${BUCKET_NAME}/${key}" --file="${filePath}" --local`, {
        stdio: "inherit",
        cwd: path.resolve(__dirname, ".."),
      });
    }
    console.log("Local sync completed via wrangler.");
    process.exit(0);
  }

  console.log(`Writing directly to local Miniflare R2 storage (${sqliteDbPath})...`);

  // We can write blobs and execute sqlite3 queries via child_process
  for (const file of files) {
    const filePath = path.join(imagesDir, file);
    const fileBuffer = fs.readFileSync(filePath);
    const mime = MIME_MAP[path.extname(file).toLowerCase()] || "image/jpeg";
    const key = `${R2_PREFIX}/${file}`;

    const blobId = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    const etag = crypto.createHash("md5").update(fileBuffer).digest("hex");
    const version = crypto.randomBytes(16).toString("hex");
    const uploaded = Date.now();
    const httpMetadata = JSON.stringify({
      contentType: mime,
      cacheControl: "public, max-age=31536000, immutable",
    });

    // Write blob
    const blobPath = path.join(blobsDir, blobId);
    fs.writeFileSync(blobPath, fileBuffer);

    // Write metadata to SQLite
    const escapedKey = key.replace(/'/g, "''");
    const escapedMetadata = httpMetadata.replace(/'/g, "''");

    const sql = `
      INSERT INTO _mf_objects (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata)
      VALUES ('${escapedKey}', '${blobId}', '${version}', ${fileBuffer.length}, '${etag}', ${uploaded}, '{}', '${escapedMetadata}', '{}')
      ON CONFLICT(key) DO UPDATE SET
        blob_id = excluded.blob_id,
        version = excluded.version,
        size = excluded.size,
        etag = excluded.etag,
        uploaded = excluded.uploaded,
        http_metadata = excluded.http_metadata;
    `;

    try {
      execSync(`sqlite3 "${sqliteDbPath}"`, { input: sql.trim(), stdio: ["pipe", "pipe", "pipe"] });
      console.log(`  ✓ Synced ${key} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`  ✗ Error syncing ${key}:`, err.message);
    }
  }

  console.log(`Local R2 sync complete: ${files.length} images stored in ${BUCKET_NAME}.`);
}
