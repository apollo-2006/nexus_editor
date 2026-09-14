// Fractional positions as digit strings, compared lexicographically.
//
// The first version used a float and generated (prev + next) / 2. Typing
// repeatedly into the same gap halves it every keystroke, and a float64 runs out
// of bits after about 50 halvings, at which point two characters get the same
// position. A string has no such floor: when there is no room between two
// digits, the result just grows by one more digit.

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

/**
 * A position strictly between `lo` and `hi`. `lo` may be '' (the start of the
 * document) and `hi` may be null (the end). Requires lo < hi.
 *
 * Invariant: no position this returns ends in '0'. A string that ends in '0' has
 * no string strictly between it and the same string without the '0', so
 * allowing one would eventually make a gap impossible to split.
 */
export function positionBetween(lo: string, hi: string | null): string {
  if (hi !== null && !(lo < hi)) throw new Error(`positionBetween: "${lo}" is not below "${hi}"`);
  let out = '';
  let upper = hi;
  for (let i = 0; ; i++) {
    const a = i < lo.length ? DIGITS.indexOf(lo[i]) : 0;
    const b = upper !== null && i < upper.length ? DIGITS.indexOf(upper[i]) : BASE;
    if (b - a > 1) return out + DIGITS[Math.floor((a + b) / 2)];
    // No room at this digit: keep lo's digit and look one deeper. Once the digits
    // differ (b = a + 1), everything after this prefix is already below hi.
    out += DIGITS[a];
    if (b - a === 1) upper = null;
  }
}

/**
 * The next position after `pos` that keeps all of `pos` but its last digit:
 * bump that digit, or, if it is already the largest, extend `pos` by one digit.
 *
 * Used when a site types straight after its own previous character. Every
 * character in the run shares the run's prefix, so concurrent runs from other
 * sites (which carry a different prefix) sort as whole runs instead of
 * alternating letter by letter. Never ends in '0'.
 */
export function positionAfter(pos: string): string {
  const d = DIGITS.indexOf(pos[pos.length - 1]);
  if (d >= 0 && d < BASE - 1) return pos.slice(0, -1) + DIGITS[d + 1];
  return pos + DIGITS[BASE >> 1];
}

/** A short per-site tag appended to every position a site generates. */
export function siteTag(siteId: string): string {
  // Digits 1..z only, so the tag never ends in '0' (see positionBetween).
  let h = 2166136261;
  for (let i = 0; i < siteId.length; i++) h = Math.imul(h ^ siteId.charCodeAt(i), 16777619);
  let tag = '';
  for (let i = 0; i < 4; i++) tag += DIGITS[1 + ((h >>> (i * 6)) % (BASE - 1))];
  return tag;
}
