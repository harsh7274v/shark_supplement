/**
 * The `users` table: the shape of a row and the lookup by email that the
 * auth routes share.
 *
 * The lookup is shared on purpose. The register route of `routes/auth.ts`
 * and the Google sign in of `routes/auth.google.ts` both key the account by
 * the email, so both have to read the same row.
 */

/** A row of the `users` table. */
export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: string;
  auth_provider: string | null;
  password_hash?: string | null;
}

/** Reads the customer of an email. */
export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db
    .prepare(
      "SELECT id, email, name, picture, role, auth_provider, password_hash FROM users WHERE email = ?",
    )
    .bind(email)
    .first<UserRow>();
}
