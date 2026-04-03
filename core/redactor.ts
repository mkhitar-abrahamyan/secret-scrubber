import { EntropyEngine, EntropyResult } from '../src/engines/entropy';
import { RegexVault, SecretPattern } from '../src/engines/regex-vault';
import { PathAnonymizer, PathAnonymizerOptions } from '../src/engines/path-anonymizer';
import { Dictionary, PIIMatch, CustomPIIPattern } from './dictionary';

export type SafetyLevel = 'RELAXED' | 'BALANCED' | 'STRICT';

export interface ScrubberConfig {
  rules?: {
    redactEmails?: boolean;
    redactIPs?: boolean;
    redactLocalPaths?: boolean;
    redactNames?: boolean;
    customPatterns?: Array<{
      name: string;
      pattern: string;
      placeholder: string;
    }>;
  };
  safetyLevel?: SafetyLevel;
  exclude?: string[];
  names?: string[];
  piiPatterns?: CustomPIIPattern[];
  sensitiveFiles?: string[];
  npmIgnore?: string[];
}

export interface RedactionEntry {
  original: string;
  placeholder: string;
  type: string;
  index: number;
}

export interface ScrubResult {
  scrubbed: string;
  redactions: RedactionEntry[];
  stats: {
    totalRedacted: number;
    byType: Record<string, number>;
  };
}

export class Redactor {
  private entropy: EntropyEngine;
  private vault: RegexVault;
  private pathAnonymizer: PathAnonymizer;
  private dictionary: Dictionary;
  private config: ScrubberConfig;
  private tokenMap: Map<string, string>;
  private tokenCounter: number;

  constructor(config: ScrubberConfig = {}) {
    this.config = config;
    this.tokenMap = new Map();
    this.tokenCounter = 0;

    const safetyLevel = config.safetyLevel || 'BALANCED';
    const entropyThreshold = safetyLevel === 'STRICT' ? 4.0
      : safetyLevel === 'RELAXED' ? 5.0
      : 4.5;

    this.entropy = new EntropyEngine(entropyThreshold);

    // Build custom patterns for RegexVault
    const customPatterns: SecretPattern[] = (config.rules?.customPatterns || []).map((cp) => ({
      name: cp.name,
      pattern: new RegExp(cp.pattern, 'g'),
      placeholder: cp.placeholder,
      severity: 'high' as const,
    }));
    this.vault = new RegexVault(customPatterns);

    this.pathAnonymizer = new PathAnonymizer({
      redactUsername: true,
    });

    this.dictionary = new Dictionary({
      names: config.names,
      piiPatterns: config.piiPatterns,
    });
  }

  scrub(input: string): ScrubResult {
    const redactions: RedactionEntry[] = [];
    let result = input;

    // Layer 1: Regex pattern matching (most specific — run first)
    const regexMatches = this.vault.scan(result);
    for (const rm of regexMatches) {
      const placeholder = this.getStablePlaceholder(rm.match, rm.pattern.placeholder);
      redactions.push({
        original: rm.match,
        placeholder,
        type: rm.pattern.name,
        index: rm.index,
      });
    }

    // Layer 2: Entropy analysis for unknown secrets
    const entropyMatches = this.entropy.scan(result);
    for (const em of entropyMatches) {
      // Skip if already caught by regex vault
      if (this.isAlreadyRedacted(em, redactions)) continue;
      const placeholder = this.getStablePlaceholder(em.value, '[HIGH_ENTROPY_SECRET]');
      redactions.push({
        original: em.value,
        placeholder,
        type: 'entropy_detected',
        index: em.startIndex,
      });
    }

    // Layer 3: PII detection
    if (this.config.rules?.redactEmails !== false || this.config.rules?.redactIPs !== false) {
      const piiMatches = this.dictionary.scanPII(result);
      for (const pm of piiMatches) {
        if (this.isOverlapping(pm.index, pm.value.length, redactions)) continue;
        if (pm.type === 'email' && this.config.rules?.redactEmails === false) continue;

        const placeholder = this.getStablePlaceholder(pm.value, pm.placeholder);
        redactions.push({
          original: pm.value,
          placeholder,
          type: pm.type,
          index: pm.index,
        });
      }
    }

    // Layer 4: Name detection
    if (this.config.rules?.redactNames !== false && this.config.safetyLevel !== 'RELAXED') {
      const nameMatches = this.dictionary.scanNames(result);
      for (const nm of nameMatches) {
        if (this.isOverlapping(nm.index, nm.value.length, redactions)) continue;
        redactions.push({
          original: nm.value,
          placeholder: nm.placeholder,
          type: 'name',
          index: nm.index,
        });
      }
    }

    // Apply redactions from end to start to preserve indices
    const sortedRedactions = [...redactions].sort((a, b) => b.index - a.index);
    for (const r of sortedRedactions) {
      const before = result.slice(0, r.index);
      const after = result.slice(r.index + r.original.length);
      result = before + r.placeholder + after;
    }

    // Layer 5: Path anonymization (runs on the already-redacted text)
    if (this.config.rules?.redactLocalPaths !== false) {
      result = this.pathAnonymizer.anonymize(result);
    }

    // Build stats
    const byType: Record<string, number> = {};
    for (const r of redactions) {
      byType[r.type] = (byType[r.type] || 0) + 1;
    }

    return {
      scrubbed: result,
      redactions,
      stats: {
        totalRedacted: redactions.length,
        byType,
      },
    };
  }

  private getStablePlaceholder(original: string, baseLabel: string): string {
    // Stable token mapping: same secret → same placeholder
    const existing = this.tokenMap.get(original);
    if (existing) return existing;

    this.tokenCounter++;
    const placeholder = `${baseLabel.replace(/\]$/, '')}_${this.tokenCounter}]`;
    this.tokenMap.set(original, placeholder);
    return placeholder;
  }

  private isAlreadyRedacted(entry: EntropyResult, redactions: RedactionEntry[]): boolean {
    return redactions.some(
      (r) => entry.startIndex >= r.index && entry.endIndex <= r.index + r.original.length,
    );
  }

  private isOverlapping(index: number, length: number, redactions: RedactionEntry[]): boolean {
    return redactions.some(
      (r) => index < r.index + r.original.length && index + length > r.index,
    );
  }

  resetTokenMap(): void {
    this.tokenMap.clear();
    this.tokenCounter = 0;
  }
}
