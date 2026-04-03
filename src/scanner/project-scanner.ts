import * as fs from 'fs';
import * as path from 'path';

export interface ScanResult {
  file: string;
  totalRedacted: number;
  byType: Record<string, number>;
}

export interface ProjectScanResult {
  files: ScanResult[];
  totalFiles: number;
  totalRedacted: number;
  skippedFiles: string[];
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.lock',
]);

const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.cache',
  '.turbo',
];

export class ProjectScanner {
  private rootDir: string;
  private excludePatterns: string[];
  private skipPaths: string[];

  constructor(rootDir: string, exclude: string[] = []) {
    this.rootDir = path.resolve(rootDir);
    this.excludePatterns = exclude;

    this.skipPaths = [...DEFAULT_EXCLUDE];

    const scrubberIgnorePath = path.join(this.rootDir, '.scrubberignore');
    if (fs.existsSync(scrubberIgnorePath)) {
      const lines = fs.readFileSync(scrubberIgnorePath, 'utf-8')
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith('#'));
      this.skipPaths.push(...lines);
    }

    for (const pattern of this.excludePatterns) {
      const clean = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\//g, '');
      if (clean) this.skipPaths.push(clean);
    }
  }

  discoverFiles(): string[] {
    const files: string[] = [];
    this.walkDir(this.rootDir, files);
    return files;
  }

  private walkDir(dir: string, files: string[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (this.shouldSkip(entry.name, fullPath)) continue;

      if (entry.isDirectory()) {
        this.walkDir(fullPath, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 1024 * 1024) continue;
        } catch {
          continue;
        }

        files.push(fullPath);
      }
    }
  }

  private shouldSkip(name: string, fullPath: string): boolean {
    if (name.startsWith('.') && name !== '.env' && name !== '.env.local'
      && name !== '.env.production' && name !== '.env.development') {
      if (this.skipPaths.includes(name)) return true;
    }

    for (const pattern of this.skipPaths) {
      if (name === pattern) return true;
      if (fullPath.includes(path.sep + pattern + path.sep)) return true;
      if (fullPath.endsWith(path.sep + pattern)) return true;
    }

    return false;
  }

  getRelativePath(filePath: string): string {
    return path.relative(this.rootDir, filePath);
  }
}
