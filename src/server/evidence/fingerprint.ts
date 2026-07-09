/**
 * SimHash document fingerprinting — deterministic, no-API near-duplicate
 * detection. Two documents carrying substantially the same text produce
 * fingerprints within a small hamming distance even when lightly reworded,
 * which is exactly the shape of wire-copy syndication. This is the copy
 * signal that a single Jaccard threshold on one extracted sentence cannot
 * provide: it fingerprints the WHOLE document.
 *
 * 64-bit simhash over shingled tokens, FNV-1a hashed, hex-encoded for
 * storage (SQLite has no unsigned 64-bit integer column).
 */

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK64 = 0xffffffffffffffffn

/** Deterministic 64-bit FNV-1a hash of a string. */
export function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = (hash * FNV_PRIME) & MASK64
  }
  return hash
}

/** Lowercase, strip punctuation, split — deliberately mirrors the evidence
 *  text normalisation but keeps stopwords: for whole-document fingerprints,
 *  function words are part of the copied surface. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0)
}

/** Overlapping 3-token shingles — word order matters for copy detection. */
function shingles(toks: string[], size = 3): string[] {
  if (toks.length <= size) return toks.length > 0 ? [toks.join(' ')] : []
  const out: string[] = []
  for (let i = 0; i + size <= toks.length; i++) out.push(toks.slice(i, i + size).join(' '))
  return out
}

/** 64-bit simhash of a text, hex-encoded (16 chars, zero-padded).
 *  Returns null for effectively-empty text (nothing to fingerprint). */
export function simhash64(text: string): string | null {
  const sh = shingles(tokens(text))
  if (sh.length === 0) return null
  const vector = new Array<number>(64).fill(0)
  for (const s of sh) {
    const h = fnv1a64(s)
    for (let bit = 0; bit < 64; bit++) {
      if ((h >> BigInt(bit)) & 1n) vector[bit] += 1
      else vector[bit] -= 1
    }
  }
  let out = 0n
  for (let bit = 0; bit < 64; bit++) {
    if (vector[bit] > 0) out |= 1n << BigInt(bit)
  }
  return out.toString(16).padStart(16, '0')
}

/** Hamming distance between two hex-encoded 64-bit simhashes (0..64). */
export function hammingDistance(hexA: string, hexB: string): number {
  let x = BigInt(`0x${hexA}`) ^ BigInt(`0x${hexB}`)
  let count = 0
  while (x > 0n) {
    count += Number(x & 1n)
    x >>= 1n
  }
  return count
}

/** At/below this hamming distance two documents are treated as carrying the
 *  same underlying text (syndicated copy). Empirically calibrated on 64-bit
 *  simhash with 3-token shingles: light rewording of the same wire copy ≈ 9,
 *  heavy rewording ≈ 12, a genuinely DIFFERENT article on the same story ≈ 19,
 *  unrelated articles ≈ 31. 14 catches syndication with a clear margin below
 *  the nearest legitimate distinct article. */
export const SIMHASH_COPY_HAMMING = 14

/** True when both fingerprints exist and are within the copy threshold. */
export function isNearDuplicate(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return hammingDistance(a, b) <= SIMHASH_COPY_HAMMING
}
