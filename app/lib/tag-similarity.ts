export interface TagRef {
  id: string;
  name: string;
}

export interface SimilarPair {
  a: TagRef;
  b: TagRef;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      row[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = temp;
    }
  }
  return row[n];
}

/**
 * Returns pairs of tags whose normalised names are identical (different case)
 * or within Levenshtein distance thresholds:
 *   length ≤ 5  → distance ≤ 1
 *   length > 5  → distance ≤ 2
 * Minimum tag length of 3 to avoid noise on very short tokens.
 */
export function findSimilarTagPairs(tags: TagRef[]): SimilarPair[] {
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const a = tags[i].name.toLowerCase();
      const b = tags[j].name.toLowerCase();
      if (a === b) {
        // Identical after normalisation (different case/whitespace)
        pairs.push({ a: tags[i], b: tags[j] });
        continue;
      }
      if (a.length < 3 || b.length < 3) continue;
      const dist = levenshtein(a, b);
      const maxLen = Math.max(a.length, b.length);
      const threshold = maxLen <= 5 ? 1 : 2;
      if (dist <= threshold) {
        pairs.push({ a: tags[i], b: tags[j] });
      }
    }
  }
  return pairs;
}
