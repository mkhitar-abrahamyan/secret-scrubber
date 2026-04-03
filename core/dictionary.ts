export interface PIIMatch {
  type: string;
  value: string;
  placeholder: string;
  index: number;
}

export interface CustomPIIPattern {
  name: string;
  pattern: string;
  flags?: string;
  placeholder: string;
}

export interface DictionaryConfig {
  names?: string[];
  piiPatterns?: CustomPIIPattern[];
}

const DEFAULT_PII_PATTERNS: Record<string, { pattern: RegExp; placeholder: string }> = {
  email: {
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    placeholder: '[EMAIL]',
  },
  phone: {
    pattern: /\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g,
    placeholder: '[PHONE]',
  },
  ssn: {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    placeholder: '[SSN]',
  },
  credit_card: {
    pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
    placeholder: '[CREDIT_CARD]',
  },
};

export class Dictionary {
  private names: Set<string>;
  private piiPatterns: Record<string, { pattern: RegExp; placeholder: string }>;

  constructor(config: DictionaryConfig = {}) {
    this.names = new Set(
      (config.names || []).map((n) => n.toLowerCase()),
    );

    this.piiPatterns = { ...DEFAULT_PII_PATTERNS };

    if (config.piiPatterns) {
      for (const cp of config.piiPatterns) {
        this.piiPatterns[cp.name] = {
          pattern: new RegExp(cp.pattern, cp.flags || 'g'),
          placeholder: cp.placeholder,
        };
      }
    }
  }

  scanPII(input: string): PIIMatch[] {
    const results: PIIMatch[] = [];

    for (const [type, config] of Object.entries(this.piiPatterns)) {
      const regex = new RegExp(config.pattern.source, config.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(input)) !== null) {
        results.push({
          type,
          value: match[0],
          placeholder: config.placeholder,
          index: match.index,
        });
      }
    }

    return results.sort((a, b) => a.index - b.index);
  }

  scanNames(input: string): PIIMatch[] {
    const results: PIIMatch[] = [];

    for (const name of this.names) {
      const regex = new RegExp(`\\b${this.escapeRegExp(name)}\\b`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(input)) !== null) {
        results.push({
          type: 'name',
          value: match[0],
          placeholder: '[PERSON_NAME]',
          index: match.index,
        });
      }
    }

    return results.sort((a, b) => a.index - b.index);
  }

  addName(name: string): void {
    this.names.add(name.toLowerCase());
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
