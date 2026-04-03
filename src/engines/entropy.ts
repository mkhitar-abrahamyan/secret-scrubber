export interface EntropyResult {
  value: string;
  score: number;
  isSecret: boolean;
  startIndex: number;
  endIndex: number;
}

export class EntropyEngine {
  private readonly threshold: number;
  private readonly minLength: number;

  constructor(threshold: number = 4.5, minLength: number = 12) {
    this.threshold = threshold;
    this.minLength = minLength;
  }

  shannonEntropy(str: string): number {
    if (str.length === 0) return 0;

    const freq: Record<string, number> = {};
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(freq)) {
      const p = count / len;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  scan(input: string): EntropyResult[] {
    const results: EntropyResult[] = [];
    // Match potential secret-like tokens: alphanumeric + common secret chars
    const tokenPattern = /[A-Za-z0-9+/=_\-]{12,}/g;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(input)) !== null) {
      const value = match[0];
      if (value.length < this.minLength) continue;

      // Skip common false positives (import paths, URLs without secrets)
      if (this.isFalsePositive(value)) continue;

      const score = this.shannonEntropy(value);
      if (score >= this.threshold) {
        results.push({
          value,
          score,
          isSecret: true,
          startIndex: match.index,
          endIndex: match.index + value.length,
        });
      }
    }

    return results;
  }

  private isFalsePositive(value: string): boolean {
    // Common non-secret patterns
    const falsePositives = [
      /^[a-z]+(-[a-z]+)+$/i,          // kebab-case module names
      /^[a-z]+(_[a-z]+)+$/i,          // snake_case identifiers
      /^[A-Z][a-z]+([A-Z][a-z]+)+$/,  // PascalCase class names
      /^[a-z]+([A-Z][a-z]+)+$/,       // camelCase identifiers
      /^https?:\/\//,                  // URLs (handled by regex vault)
      /^[0-9a-f]{32}$/i,              // MD5 hashes (might be intended)
    ];

    return falsePositives.some((p) => p.test(value));
  }
}
