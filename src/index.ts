import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { Redactor, ScrubberConfig, ScrubResult } from '../core/redactor';
import { ClipboardAdapter } from '../adapters/clipboard';
import { ProjectScanner } from './scanner/project-scanner';
import { IgnoreAuditor } from './scanner/ignore-auditor';

export { Redactor, ScrubResult, ScrubberConfig } from '../core/redactor';
export { EntropyEngine } from './engines/entropy';
export { RegexVault, SECRET_PATTERNS } from './engines/regex-vault';
export { PathAnonymizer } from './engines/path-anonymizer';
export { Dictionary } from '../core/dictionary';
export { ClipboardAdapter } from '../adapters/clipboard';
export { ProjectScanner } from './scanner/project-scanner';
export { IgnoreAuditor } from './scanner/ignore-auditor';

// ─── Programmatic API ────────────────────────────────────────

export function scrub(input: string, config?: ScrubberConfig): ScrubResult {
  const redactor = new Redactor(config);
  return redactor.scrub(input);
}

export function scrubFile(filePath: string, config?: ScrubberConfig): ScrubResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  return scrub(content, config);
}

function loadConfig(configPath?: string): ScrubberConfig {
  const candidates = configPath
    ? [configPath]
    : ['scrubber.config.json', '.scrubberrc.json'];

  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) {
      try {
        const raw = fs.readFileSync(resolved, 'utf-8');
        return JSON.parse(raw) as ScrubberConfig;
      } catch {
        console.warn(`[secret-scrubber] Failed to parse config: ${resolved}`);
      }
    }
  }

  return {};
}

// ─── CLI ─────────────────────────────────────────────────────

const program = new Command();

program
  .name('scrubber')
  .description('Privacy firewall — prevent secrets, PII, and local paths from leaking to LLM providers')
  .version('1.0.0');

program
  .command('scrub')
  .description('Scrub a file or piped input for sensitive data')
  .argument('[file]', 'File to scrub (reads stdin if omitted)')
  .option('-c, --config <path>', 'Path to scrubber.config.json')
  .option('-o, --output <path>', 'Write scrubbed output to file')
  .option('-s, --safety <level>', 'Safety level: RELAXED | BALANCED | STRICT', 'BALANCED')
  .option('--stats', 'Print redaction stats to stderr')
  .action(async (file: string | undefined, opts: Record<string, string | boolean | undefined>) => {
    const config = loadConfig(opts.config as string | undefined);
    if (opts.safety) {
      config.safetyLevel = opts.safety as 'RELAXED' | 'BALANCED' | 'STRICT';
    }

    let input: string;

    if (file) {
      const resolved = path.resolve(process.cwd(), file);
      if (!fs.existsSync(resolved)) {
        console.error(`[secret-scrubber] File not found: ${resolved}`);
        process.exit(1);
      }
      input = fs.readFileSync(resolved, 'utf-8');
    } else {
      // Read from stdin
      input = await readStdin();
    }

    const redactor = new Redactor(config);
    const result = redactor.scrub(input);

    if (opts.output) {
      fs.writeFileSync(opts.output as string, result.scrubbed, 'utf-8');
      console.error(`[secret-scrubber] Scrubbed output written to ${opts.output}`);

      // Auto-add output file to .gitignore and .npmignore if not already there
      const outputBasename = path.basename(opts.output as string);
      const ignoreFiles = ['.gitignore', '.npmignore'];
      for (const ignoreFile of ignoreFiles) {
        const ignorePath = path.resolve(process.cwd(), ignoreFile);
        let lines: string[] = [];
        let content = '';
        if (fs.existsSync(ignorePath)) {
          content = fs.readFileSync(ignorePath, 'utf-8');
          lines = content.split('\n').map((l: string) => l.trim());
        }
        const alreadyCovered = lines.some((l: string) =>
          l === outputBasename || l === 'scrubbed-*' || l === 'scrubbed-*.*'
        );
        if (!alreadyCovered) {
          if (content && !content.endsWith('\n')) content += '\n';
          content += outputBasename + '\n';
          fs.writeFileSync(ignorePath, content, 'utf-8');
          console.error(`[secret-scrubber] Added "${outputBasename}" to ${ignoreFile}`);
        }
      }
    } else {
      process.stdout.write(result.scrubbed);
    }

    if (opts.stats) {
      console.error(`\n--- Redaction Stats ---`);
      console.error(`Total redacted: ${result.stats.totalRedacted}`);
      for (const [type, count] of Object.entries(result.stats.byType)) {
        console.error(`  ${type}: ${count}`);
      }
    }
  });

program
  .command('copy')
  .description('Read clipboard, scrub it, and write the scrubbed version back')
  .option('-c, --config <path>', 'Path to scrubber.config.json')
  .action(async (opts: Record<string, string | undefined>) => {
    const config = loadConfig(opts.config);
    const adapter = new ClipboardAdapter(config);
    try {
      const result = await adapter.readAndScrub();
      console.error(`[secret-scrubber] Clipboard scrubbed. ${result.stats.totalRedacted} items redacted.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  });

program
  .command('scan')
  .description('Scan an entire project directory for secrets')
  .argument('[dir]', 'Directory to scan (defaults to current directory)', '.')
  .option('-c, --config <path>', 'Path to scrubber.config.json')
  .option('-s, --safety <level>', 'Safety level: RELAXED | BALANCED | STRICT', 'BALANCED')
  .option('-o, --output <path>', 'Write full report to a file')
  .option('--skip <patterns>', 'Comma-separated list of files/dirs to skip')
  .action((dir: string, opts: Record<string, string | boolean | undefined>) => {
    const config = loadConfig(opts.config as string | undefined);
    if (opts.safety) {
      config.safetyLevel = opts.safety as 'RELAXED' | 'BALANCED' | 'STRICT';
    }

    const extraExclude = opts.skip
      ? (opts.skip as string).split(',').map((s: string) => s.trim())
      : [];
    const exclude = [...(config.exclude || []), ...extraExclude];

    const rootDir = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(rootDir)) {
      console.error(`[secret-scrubber] Directory not found: ${rootDir}`);
      process.exit(1);
    }

    const scanner = new ProjectScanner(rootDir, exclude);
    const files = scanner.discoverFiles();

    console.error(`[secret-scrubber] Scanning ${files.length} files in ${rootDir}...\n`);

    const redactor = new Redactor(config);
    let totalRedacted = 0;
    const fileResults: Array<{ file: string; count: number; byType: Record<string, number> }> = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = redactor.scrub(content);

      if (result.stats.totalRedacted > 0) {
        const relPath = scanner.getRelativePath(filePath);
        totalRedacted += result.stats.totalRedacted;
        fileResults.push({
          file: relPath,
          count: result.stats.totalRedacted,
          byType: result.stats.byType,
        });
      }
    }

    if (fileResults.length === 0) {
      console.log('No secrets found. Your project looks clean.');
    } else {
      console.log(`Found ${totalRedacted} secret(s) in ${fileResults.length} file(s):\n`);
      for (const fr of fileResults) {
        const types = Object.entries(fr.byType)
          .map(([t, c]) => `${t}(${c})`)
          .join(', ');
        console.log(`  ${fr.file}  — ${fr.count} hit(s): ${types}`);
      }
      console.log(`\nTotal: ${totalRedacted} secret(s)`);
    }

    if (opts.output) {
      const report = {
        scannedDir: rootDir,
        totalFiles: files.length,
        totalSecrets: totalRedacted,
        files: fileResults,
      };
      fs.writeFileSync(opts.output as string, JSON.stringify(report, null, 2) + '\n', 'utf-8');
      console.error(`\n[secret-scrubber] Report saved to ${opts.output}`);

      // Auto-add report file to .gitignore and .npmignore if not already there
      const reportBasename = path.basename(opts.output as string);
      const ignoreFiles = ['.gitignore', '.npmignore'];
      for (const ignoreFile of ignoreFiles) {
        const ignorePath = path.join(rootDir, ignoreFile);
        let lines: string[] = [];
        let content = '';
        if (fs.existsSync(ignorePath)) {
          content = fs.readFileSync(ignorePath, 'utf-8');
          lines = content.split('\n').map((l: string) => l.trim());
        }
        const alreadyCovered = lines.some((l: string) =>
          l === reportBasename || l === 'scrubber-report.*' || l === 'scrubber-report*'
        );
        if (!alreadyCovered) {
          if (content && !content.endsWith('\n')) content += '\n';
          content += reportBasename + '\n';
          fs.writeFileSync(ignorePath, content, 'utf-8');
          console.error(`[secret-scrubber] Added "${reportBasename}" to ${ignoreFile}`);
        }
      }
    }
  });

program
  .command('check')
  .description('Audit .gitignore and .npmignore to verify sensitive files are excluded')
  .argument('[dir]', 'Project directory to check (defaults to current directory)', '.')
  .option('-c, --config <path>', 'Path to scrubber.config.json')
  .option('--fix', 'Automatically add missing patterns to ignore files')
  .action((dir: string, opts: Record<string, string | boolean | undefined>) => {
    const config = loadConfig(opts.config as string | undefined);
    const rootDir = path.resolve(process.cwd(), dir);

    if (!fs.existsSync(rootDir)) {
      console.error(`[secret-scrubber] Directory not found: ${rootDir}`);
      process.exit(1);
    }

    const auditor = new IgnoreAuditor(rootDir, config.sensitiveFiles || []);

    // Audit .gitignore and .dockerignore
    const report = auditor.audit();

    for (const result of report.results) {
      const icon = result.status === 'pass' ? 'PASS'
        : result.status === 'warn' ? 'WARN'
        : 'FAIL';

      console.log(`\n[${icon}] ${result.file}`);

      if (result.present.length > 0) {
        console.log('  Covered:');
        for (const p of result.present) {
          console.log(`    + ${p}`);
        }
      }

      if (result.missing.length > 0) {
        console.log('  Missing:');
        for (const m of result.missing) {
          console.log(`    - ${m}`);
        }
      }
    }

    // Audit .npmignore
    const npmResult = auditor.auditNpmIgnore(config.npmIgnore || []);
    const npmIcon = npmResult.status === 'pass' ? 'PASS'
      : npmResult.status === 'warn' ? 'WARN'
      : 'FAIL';

    console.log(`\n[${npmIcon}] .npmignore`);

    if (npmResult.present.length > 0) {
      console.log('  Covered:');
      for (const p of npmResult.present) {
        console.log(`    + ${p}`);
      }
    }

    if (npmResult.missing.length > 0) {
      console.log('  Missing:');
      for (const m of npmResult.missing) {
        console.log(`    - ${m}`);
      }
    }

    const totalMissing = report.totalMissing + npmResult.missing.length;

    if (totalMissing > 0) {
      console.log(`\n${totalMissing} sensitive pattern(s) not covered.`);

      if (opts.fix) {
        const gitAdded = auditor.fix('.gitignore');
        if (gitAdded.length > 0) {
          console.log(`\nAdded ${gitAdded.length} pattern(s) to .gitignore:`);
          for (const a of gitAdded) {
            console.log(`  + ${a}`);
          }
        }

        const npmAdded = auditor.generateNpmIgnore(config.npmIgnore || []);
        if (npmAdded.length > 0) {
          console.log(`\nAdded ${npmAdded.length} pattern(s) to .npmignore:`);
          for (const a of npmAdded) {
            console.log(`  + ${a}`);
          }
        }
      } else {
        console.log('Run with --fix to add them automatically.');
      }
    } else {
      console.log('\nAll sensitive files are properly ignored.');
    }
  });

program
  .command('init')
  .description('Create a default scrubber.config.json and .npmignore in the current directory')
  .action(() => {
    const configPath = path.resolve(process.cwd(), 'scrubber.config.json');
    if (fs.existsSync(configPath)) {
      console.error('[secret-scrubber] scrubber.config.json already exists.');
      process.exit(1);
    }

    const defaultConfig: ScrubberConfig = {
      rules: {
        redactEmails: true,
        redactIPs: true,
        redactLocalPaths: true,
        redactNames: false,
        customPatterns: [],
      },
      safetyLevel: 'BALANCED',
      exclude: ['node_modules/**', '.git/**', 'dist/**'],
      names: [],
      piiPatterns: [],
      sensitiveFiles: ['.env', '.env.*', '*.pem', '*.key'],
      npmIgnore: [],
    };

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf-8');
    console.log('[secret-scrubber] Created scrubber.config.json');

    // Also generate .npmignore if it doesn't exist
    const rootDir = process.cwd();
    const auditor = new IgnoreAuditor(rootDir);
    const added = auditor.generateNpmIgnore();
    if (added.length > 0) {
      console.log(`[secret-scrubber] Created .npmignore with ${added.length} pattern(s)`);
    }
  });

program.parse(process.argv);

// ─── Helpers ─────────────────────────────────────────────────

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      reject(new Error('[secret-scrubber] No input. Pipe data or provide a file argument.'));
      return;
    }

    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}
