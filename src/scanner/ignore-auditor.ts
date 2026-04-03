import * as fs from 'fs';
import * as path from 'path';

export interface IgnoreAuditResult {
  file: string;
  missing: string[];
  present: string[];
  status: 'pass' | 'warn' | 'fail';
}

export interface AuditReport {
  results: IgnoreAuditResult[];
  totalMissing: number;
  totalChecked: number;
}

const DEFAULT_SENSITIVE_PATTERNS: string[] = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.jks',
  '*.keystore',
  'scrubber-report.*',
  'scrubbed-*',
  'scrubber.config.json',
  '.scrubberrc.json',
];

const DEFAULT_NPMIGNORE_PATTERNS: string[] = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'scrubber-report.*',
  'scrubbed-*',
  'scrubber.config.json',
  '.scrubberrc.json',
  '.scrubberignore',
  'coverage/',
];

const IGNORE_FILES = ['.gitignore', '.dockerignore'];

export class IgnoreAuditor {
  private rootDir: string;
  private sensitivePatterns: string[];
  private ignoreFiles: string[];

  constructor(
    rootDir: string,
    customSensitivePatterns: string[] = [],
    ignoreFiles: string[] = IGNORE_FILES,
  ) {
    this.rootDir = path.resolve(rootDir);
    this.sensitivePatterns = [
      ...DEFAULT_SENSITIVE_PATTERNS,
      ...customSensitivePatterns,
    ];
    this.ignoreFiles = ignoreFiles;
  }

  audit(): AuditReport {
    const results: IgnoreAuditResult[] = [];
    let totalMissing = 0;

    for (const ignoreFile of this.ignoreFiles) {
      const filePath = path.join(this.rootDir, ignoreFile);

      if (!fs.existsSync(filePath)) {
        results.push({
          file: ignoreFile,
          missing: [...this.sensitivePatterns],
          present: [],
          status: 'fail',
        });
        totalMissing += this.sensitivePatterns.length;
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith('#'));

      const missing: string[] = [];
      const present: string[] = [];

      for (const pattern of this.sensitivePatterns) {
        if (this.isPatternCovered(pattern, lines)) {
          present.push(pattern);
        } else {
          missing.push(pattern);
        }
      }

      const status = missing.length === 0 ? 'pass'
        : missing.some((m) => m === '.env' || m === '.env.*') ? 'fail'
        : 'warn';

      results.push({ file: ignoreFile, missing, present, status });
      totalMissing += missing.length;
    }

    return {
      results,
      totalMissing,
      totalChecked: this.sensitivePatterns.length * this.ignoreFiles.length,
    };
  }

  fix(ignoreFile: string = '.gitignore'): string[] {
    const filePath = path.join(this.rootDir, ignoreFile);
    const report = this.audit();
    const result = report.results.find((r) => r.file === ignoreFile);

    if (!result || result.missing.length === 0) return [];

    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
      if (!content.endsWith('\n')) content += '\n';
    }

    content += '\n# Sensitive files (added by secret-scrubber)\n';
    for (const pattern of result.missing) {
      content += pattern + '\n';
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return result.missing;
  }

  auditNpmIgnore(customPatterns: string[] = []): IgnoreAuditResult {
    const filePath = path.join(this.rootDir, '.npmignore');
    const required = [...DEFAULT_NPMIGNORE_PATTERNS, ...customPatterns];

    if (!fs.existsSync(filePath)) {
      return {
        file: '.npmignore',
        missing: required,
        present: [],
        status: 'fail',
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l && !l.startsWith('#'));

    const missing: string[] = [];
    const present: string[] = [];

    for (const pattern of required) {
      if (this.isPatternCovered(pattern, lines)) {
        present.push(pattern);
      } else {
        missing.push(pattern);
      }
    }

    const status = missing.length === 0 ? 'pass'
      : missing.length > 3 ? 'fail'
      : 'warn';

    return { file: '.npmignore', missing, present, status };
  }

  fixNpmIgnore(customPatterns: string[] = []): string[] {
    const filePath = path.join(this.rootDir, '.npmignore');
    const result = this.auditNpmIgnore(customPatterns);

    if (result.missing.length === 0) return [];

    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
      if (!content.endsWith('\n')) content += '\n';
    }

    content += '\n# Sensitive files (added by secret-scrubber)\n';
    for (const pattern of result.missing) {
      content += pattern + '\n';
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return result.missing;
  }

  generateNpmIgnore(customPatterns: string[] = []): string[] {
    const filePath = path.join(this.rootDir, '.npmignore');

    if (fs.existsSync(filePath)) {
      return this.fixNpmIgnore(customPatterns);
    }

    const patterns = [...DEFAULT_NPMIGNORE_PATTERNS, ...customPatterns];
    let content = '# Generated by secret-scrubber\n';
    content += '# Prevents sensitive files from being published to npm\n\n';
    for (const pattern of patterns) {
      content += pattern + '\n';
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return patterns;
  }

  private isPatternCovered(sensitive: string, ignoreLines: string[]): boolean {
    for (const line of ignoreLines) {
      if (line === sensitive) return true;

      if (sensitive.startsWith('.env')) {
        if (line === '.env*' || line === '.env.*' || line === '.env') {
          if (sensitive === '.env' || sensitive.startsWith('.env.')) return true;
        }
      }

      if (line.includes('*')) {
        const regex = this.globToRegex(line);
        if (regex.test(sensitive)) return true;
      }
    }
    return false;
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '<<GLOBSTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<GLOBSTAR>>/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp('^' + escaped + '$');
  }
}
