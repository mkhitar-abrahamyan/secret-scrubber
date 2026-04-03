import { Redactor, ScrubberConfig, ScrubResult } from '../core/redactor';

export class ClipboardAdapter {
  private redactor: Redactor;

  constructor(config: ScrubberConfig = {}) {
    this.redactor = new Redactor(config);
  }

  async scrubAndCopy(input: string): Promise<ScrubResult> {
    const result = this.redactor.scrub(input);

    try {
      // Dynamic import for clipboardy (ESM module)
      const clipboardy = await import('clipboardy');
      await clipboardy.default.write(result.scrubbed);
    } catch {
      // Fallback: if clipboardy is not available, just return the result
      console.warn('[secret-scrubber] Clipboard access unavailable. Scrubbed text returned but not copied.');
    }

    return result;
  }

  async readAndScrub(): Promise<ScrubResult> {
    try {
      const clipboardy = await import('clipboardy');
      const raw = await clipboardy.default.read();
      const result = this.redactor.scrub(raw);
      await clipboardy.default.write(result.scrubbed);
      return result;
    } catch {
      throw new Error('[secret-scrubber] Clipboard access unavailable.');
    }
  }
}
