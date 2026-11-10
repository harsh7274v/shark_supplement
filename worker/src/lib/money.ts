/**
 * All money is stored and handled as integer paise server-side.
 */

/** Converts rupees (possibly fractional) to integer paise. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Percent discount of `sale` off `mrp`, rounded to the nearest integer.
 * Returns 0 when `mrp` is not positive and never returns a negative value
 * (a sale above mrp clamps to 0; input validation happens at the API layer).
 */
export function discountPercent(mrp: number, sale: number): number {
  if (mrp <= 0) return 0;
  return Math.max(0, Math.round(((mrp - sale) / mrp) * 100));
}
