/**
 * The pieces the two admin route modules share: the slug of a name, the
 * reading of the fields of a body, and the messages they answer with.
 *
 * The slug of a product and the slug of a category are made of the same
 * helper, so a name of the catalog reads the same way in the two.
 */

/** The message of a body that is not a JSON object. */
export const INVALID_BODY = "Invalid request body";

/** The message of a name that is empty. */
export const NAME_REQUIRED = "Name is required";

/** The message of a name that has no letters or numbers in it. */
export const NAME_NOT_A_SLUG = "Name must have letters or digits";

/**
 * Turns a name into the slug of it: the letters and the numbers of the name
 * in small letters, with a dash between the words.
 *
 * The accents are taken off the letters first, so a name that is written with
 * them still gets a slug of plain letters.
 */
export function kebabCase(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Reads a string of a body; a missing one reads as an empty string. */
export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads a text of a body that may be empty.
 *
 * An empty text reads as `null`, so a column that holds a text can be
 * emptied with an empty string.
 */
export function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
