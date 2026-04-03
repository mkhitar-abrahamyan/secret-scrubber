import * as path from 'path';
import * as os from 'os';

export interface PathAnonymizerOptions {
  virtualRoot?: string;
  redactUsername?: boolean;
}

export class PathAnonymizer {
  private readonly virtualRoot: string;
  private readonly redactUsername: boolean;
  private readonly homeDir: string;
  private readonly username: string;
  private readonly pathPatterns: RegExp[];

  constructor(options: PathAnonymizerOptions = {}) {
    this.virtualRoot = options.virtualRoot || '/workspace';
    this.redactUsername = options.redactUsername !== false;
    this.homeDir = os.homedir();
    this.username = os.userInfo().username;

    this.pathPatterns = [
      // Unix-style absolute paths
      /(?:\/(?:Users|home|root)\/[^\s"'`,;:]+)/g,
      // Windows-style absolute paths
      /(?:[A-Z]:\\(?:Users|Documents and Settings)\\[^\s"'`,;:]+)/gi,
      // Generic absolute paths with common project directories
      /(?:\/(?:var|opt|srv|tmp|etc)\/[^\s"'`,;:]+)/g,
      // Windows drive paths
      /(?:[A-Z]:\\[^\s"'`,;:]{3,})/gi,
    ];
  }

  anonymize(input: string): string {
    let result = input;

    // Replace home directory first (most specific)
    if (this.homeDir) {
      const escapedHome = this.escapeRegExp(this.homeDir);
      const homeRegex = new RegExp(escapedHome, 'g');
      result = result.replace(homeRegex, this.virtualRoot);

      // Also handle forward-slash variant on Windows
      const forwardSlashHome = this.homeDir.replace(/\\/g, '/');
      if (forwardSlashHome !== this.homeDir) {
        const escapedForward = this.escapeRegExp(forwardSlashHome);
        result = result.replace(new RegExp(escapedForward, 'g'), this.virtualRoot);
      }
    }

    // Replace username occurrences in paths
    if (this.redactUsername && this.username) {
      const usernameInPath = new RegExp(
        `(?<=[/\\\\])${this.escapeRegExp(this.username)}(?=[/\\\\]|$)`,
        'g',
      );
      result = result.replace(usernameInPath, 'user');
    }

    // Flatten remaining absolute paths to virtual workspace
    for (const pattern of this.pathPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      result = result.replace(regex, (match) => {
        return this.flattenPath(match);
      });
    }

    return result;
  }

  private flattenPath(absolutePath: string): string {
    // Extract the meaningful project-relative portion
    const normalized = absolutePath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);

    // Find the project-meaningful segments (skip system dirs)
    const systemDirs = new Set([
      'users', 'home', 'root', 'var', 'opt', 'srv', 'tmp', 'etc',
      'documents and settings', 'appdata', 'local',
    ]);

    let startIdx = 0;
    for (let i = 0; i < segments.length; i++) {
      if (systemDirs.has(segments[i].toLowerCase())) {
        startIdx = i + 1;
        // Skip the username after Users/home
        if (['users', 'home'].includes(segments[i].toLowerCase()) && i + 1 < segments.length) {
          startIdx = i + 2;
        }
      }
    }

    const projectPath = segments.slice(startIdx).join('/');
    return projectPath ? `${this.virtualRoot}/${projectPath}` : this.virtualRoot;
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
