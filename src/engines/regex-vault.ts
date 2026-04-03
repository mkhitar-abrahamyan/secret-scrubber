export interface SecretPattern {
  name: string;
  pattern: RegExp;
  placeholder: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, placeholder: '[AWS_ACCESS_KEY]', severity: 'critical' },
  { name: 'AWS Secret Key', pattern: /(?:aws_secret_access_key|secret_key)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, placeholder: '[AWS_SECRET_KEY]', severity: 'critical' },
  // Google
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/g, placeholder: '[GOOGLE_API_KEY]', severity: 'critical' },
  // GitHub
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g, placeholder: '[GITHUB_TOKEN]', severity: 'critical' },
  // Stripe
  { name: 'Stripe Secret Key', pattern: /sk_live_[0-9a-zA-Z]{24,}/g, placeholder: '[STRIPE_SECRET_KEY]', severity: 'critical' },
  { name: 'Stripe Test Key', pattern: /[sr]k_test_[0-9a-zA-Z]{24,}/g, placeholder: '[STRIPE_TEST_KEY]', severity: 'medium' },
  // OpenAI
  { name: 'OpenAI API Key', pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, placeholder: '[OPENAI_API_KEY]', severity: 'critical' },
  { name: 'OpenAI Key v2', pattern: /sk-proj-[A-Za-z0-9\-_]{40,}/g, placeholder: '[OPENAI_API_KEY]', severity: 'critical' },
  // Anthropic
  { name: 'Anthropic API Key', pattern: /sk-ant-[A-Za-z0-9\-_]{40,}/g, placeholder: '[ANTHROPIC_API_KEY]', severity: 'critical' },
  // Slack
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,13}-[0-9a-zA-Z\-]*/g, placeholder: '[SLACK_TOKEN]', severity: 'critical' },
  // Database URIs
  { name: 'MongoDB URI', pattern: /mongodb(\+srv)?:\/\/[^\s"']+/gi, placeholder: '[MONGODB_URI]', severity: 'critical' },
  { name: 'PostgreSQL URI', pattern: /postgres(ql)?:\/\/[^\s"']+/gi, placeholder: '[POSTGRES_URI]', severity: 'critical' },
  { name: 'MySQL URI', pattern: /mysql:\/\/[^\s"']+/gi, placeholder: '[MYSQL_URI]', severity: 'critical' },
  { name: 'Redis URI', pattern: /redis:\/\/[^\s"']+/gi, placeholder: '[REDIS_URI]', severity: 'critical' },
  // JWT
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, placeholder: '[JWT_TOKEN]', severity: 'high' },
  // SSH / RSA
  { name: 'RSA Private Key', pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/g, placeholder: '[RSA_PRIVATE_KEY]', severity: 'critical' },
  { name: 'SSH Private Key', pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]+?-----END OPENSSH PRIVATE KEY-----/g, placeholder: '[SSH_PRIVATE_KEY]', severity: 'critical' },
  // Generic env patterns
  { name: 'Generic Secret Env', pattern: /(?:SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY)\s*[=:]\s*["']?([^\s"']{8,})["']?/gi, placeholder: '[REDACTED_SECRET]', severity: 'high' },
  // IP Addresses
  { name: 'IPv4 Address', pattern: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, placeholder: '[IP_ADDRESS]', severity: 'medium' },
  // Email
  { name: 'Email Address', pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, placeholder: '[EMAIL]', severity: 'medium' },
  // IBAN (international)
  { name: 'IBAN', pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g, placeholder: '[IBAN]', severity: 'high' },
];

export class RegexVault {
  private patterns: SecretPattern[];

  constructor(customPatterns: SecretPattern[] = []) {
    this.patterns = [...SECRET_PATTERNS, ...customPatterns];
  }

  scan(input: string): Array<{ pattern: SecretPattern; match: string; index: number }> {
    const results: Array<{ pattern: SecretPattern; match: string; index: number }> = [];
    for (const p of this.patterns) {
      const regex = new RegExp(p.pattern.source, p.pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = regex.exec(input)) !== null) {
        results.push({ pattern: p, match: m[0], index: m.index });
      }
    }
    return results.sort((a, b) => a.index - b.index);
  }

  getPatterns(): SecretPattern[] {
    return [...this.patterns];
  }
}
