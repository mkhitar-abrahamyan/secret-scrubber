# @mkhitar/secret-scrubber

> Privacy firewall for developers — automatically strips API keys, passwords, PII, and local file paths before you send code to AI assistants.

## Why?

Every time you paste code into ChatGPT, Copilot, or Claude, you might accidentally send:

- API keys and tokens (AWS, Stripe, OpenAI, GitHub...)
- Database connection strings with passwords
- Email addresses, phone numbers, credit card numbers
- Your local file paths that reveal your username and machine

**secret-scrubber** catches all of that automatically. One command. Zero config needed.

---

## Quick Start

### Install

```bash
npm install @mkhitar/secret-scrubber
```

### Use it

```bash
# Scrub a single file
scrubber scrub .env

# Scan your entire project for secrets
scrubber scan

# Check if .env is in your .gitignore
scrubber check

# Pipe anything through it
cat config.ts | scrubber scrub
```

That's it. Secrets are replaced with safe placeholders like `[STRIPE_SECRET_KEY_1]`.

---

## What It Catches (Out of the Box)

| Category | Examples |
|----------|---------|
| **Cloud Keys** | AWS access keys, Google API keys |
| **AI Provider Keys** | OpenAI (`sk-proj-...`), Anthropic (`sk-ant-...`) |
| **Code Hosting** | GitHub tokens (`ghp_...`, `ghs_...`) |
| **Payment** | Stripe secret/test keys |
| **Chat/Comms** | Slack bot tokens, webhook URLs |
| **Databases** | MongoDB, PostgreSQL, MySQL, Redis connection URIs |
| **Auth Tokens** | JWT tokens, RSA/SSH private keys |
| **Env Variables** | Anything named `SECRET`, `PASSWORD`, `TOKEN`, `API_KEY` |
| **PII** | Emails, phone numbers, SSNs, credit cards, IBANs |
| **IP Addresses** | IPv4 addresses |
| **File Paths** | Local absolute paths (`/Users/you/...`, `C:\Users\you\...`) |

**30+ built-in patterns** — and you can add your own (see [Custom Patterns](#custom-patterns)).

---

## CLI Reference

### `scrubber scrub [file]`

Scrub a file or piped stdin.

```bash
scrubber scrub .env                    # Scrub a file, print to stdout
scrubber scrub config.ts --stats       # Also show what was redacted
scrubber scrub src/db.ts -o clean.ts   # Save scrubbed output to file
cat logs.txt | scrubber scrub          # Pipe mode
scrubber scrub .env -s STRICT          # Use strict safety level
```

**Options:**

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Write scrubbed output to a file |
| `-s, --safety <level>` | Safety level: `RELAXED`, `BALANCED` (default), `STRICT` |
| `-c, --config <path>` | Path to a custom config file |
| `--stats` | Print redaction summary to stderr |

### `scrubber copy`

Reads your clipboard, scrubs it, and puts the clean version back.

```bash
scrubber copy
```

Perfect for the workflow: copy code → run `scrubber copy` → paste into AI chat.

### `scrubber scan [dir]`

Scan an **entire project** for secrets. Walks all files, skips binaries, respects `.scrubberignore`.

```bash
scrubber scan                          # Scan current directory
scrubber scan ./my-project             # Scan a specific directory
scrubber scan -o report.json           # Save results to a JSON report
scrubber scan --skip tests,docs        # Skip specific directories
scrubber scan -s STRICT                # Use strict safety level
```

**Options:**

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Save JSON report to a file |
| `-s, --safety <level>` | Safety level: `RELAXED`, `BALANCED` (default), `STRICT` |
| `-c, --config <path>` | Path to a custom config file |
| `--skip <patterns>` | Comma-separated list of dirs/files to skip |

**Auto-skipped by default:** `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, `__pycache__`

You can also create a `.scrubberignore` file (same syntax as `.gitignore`) to permanently exclude paths:

```
# .scrubberignore
fixtures/
*.test.ts
data/mock-secrets.json
```

### `scrubber check [dir]`

Audit your `.gitignore`, `.dockerignore`, **and `.npmignore`** to make sure sensitive files never get committed or published.

```bash
scrubber check                  # Audit current project
scrubber check ./my-project     # Audit a specific directory
scrubber check --fix            # Automatically add missing patterns to all ignore files
```

**What it checks by default:**

- **`.gitignore` / `.dockerignore`:** `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `scrubber-report.*`, `scrubber.config.json`, `.scrubberrc.json`
- **`.npmignore`:** `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `scrubber-report.*`, `scrubber.config.json`, `.scrubberrc.json`, `.scrubberignore`, `coverage/`

You can add your own entries via config (see [Sensitive Files](#sensitive-files) and [npm Ignore](#npm-ignore)).

**Example output:**

```
[FAIL] .gitignore
  Covered:
    + .env
    + .env.*
  Missing:
    - *.pem
    - scrubber-report.*

[WARN] .npmignore
  Missing:
    - scrubber.config.json
    - scrubber-report.*

4 sensitive pattern(s) not covered.
Run with --fix to add them automatically.
```

With `--fix`, it updates `.gitignore` **and** creates/updates `.npmignore` for you.

### `scrubber init`

Creates a starter `scrubber.config.json` **and `.npmignore`** in your current directory.

```bash
scrubber init
```

The generated `.npmignore` automatically excludes sensitive files like `.env`, report outputs, config files, and private keys from being published to npm.

---

## Configuration

Configuration is **optional** — everything works out of the box. But if you want to customize, create a `scrubber.config.json`:

```json
{
  "rules": {
    "redactEmails": true,
    "redactIPs": true,
    "redactLocalPaths": true,
    "redactNames": false
  },
  "safetyLevel": "BALANCED"
}
```

Or generate one with `scrubber init`.

### Safety Levels

| Level | What it does |
|-------|-------------|
| `RELAXED` | Only catches obvious secrets (known patterns) |
| `BALANCED` | **(default)** Catches API keys + high-entropy strings |
| `STRICT` | Aggressive — flags anything that looks remotely secret |

### Custom Patterns

Add your own regex patterns to catch domain-specific secrets:

```json
{
  "rules": {
    "customPatterns": [
      {
        "name": "Internal-Service-Key",
        "pattern": "myapp_sk_[A-Za-z0-9]{32}",
        "placeholder": "[INTERNAL_KEY]"
      },
      {
        "name": "Company-Account-ID",
        "pattern": "ACC-\\d{8}-[A-Z]{2}",
        "placeholder": "[ACCOUNT_ID]"
      }
    ]
  }
}
```

### Custom Names

If you want to redact specific names (your name, teammates, company name):

```json
{
  "names": ["John", "Jane", "Acme Corp"],
  "rules": {
    "redactNames": true
  }
}
```

### Custom PII Patterns

Add locale-specific PII patterns for your region:

```json
{
  "piiPatterns": [
    {
      "name": "national_id",
      "pattern": "\\b\\d{3}-\\d{4}-\\d{4}\\b",
      "placeholder": "[NATIONAL_ID]"
    },
    {
      "name": "local_phone",
      "pattern": "\\+49\\s?\\d{3}\\s?\\d{7,8}",
      "placeholder": "[PHONE]"
    }
  ]
}
```

### Sensitive Files

Customize which files `scrubber check` verifies are in `.gitignore`:

```json
{
  "sensitiveFiles": ["secrets.json", ".credentials", "*.secret"]
}
```

These are **added** to the built-in defaults — you don't need to repeat them.

### npm Ignore

Add extra patterns that `scrubber check` verifies are in `.npmignore`:

```json
{
  "npmIgnore": ["internal/", "*.log", "docker-compose.yml"]
}
```

These are merged with the defaults (`.env`, `*.pem`, `scrubber-report.*`, `scrubber.config.json`, etc.).

### Exclude (for `scan`)

Control which directories/files `scrubber scan` skips:

```json
{
  "exclude": ["node_modules/**", ".git/**", "dist/**", "test/fixtures/**"]
}
```

Or use a `.scrubberignore` file in your project root (same syntax as `.gitignore`).

### Full Config Example

```json
{
  "rules": {
    "redactEmails": true,
    "redactIPs": true,
    "redactLocalPaths": true,
    "redactNames": true,
    "customPatterns": [
      {
        "name": "Internal-Token",
        "pattern": "tok_[a-f0-9]{40}",
        "placeholder": "[INTERNAL_TOKEN]"
      }
    ]
  },
  "safetyLevel": "BALANCED",
  "exclude": ["node_modules/**", ".git/**", "dist/**"],
  "names": ["Alice", "Bob", "Acme Inc"],
  "piiPatterns": [
    {
      "name": "tax_id",
      "pattern": "\\b\\d{2}-\\d{7}\\b",
      "placeholder": "[TAX_ID]"
    }
  ],
  "sensitiveFiles": ["secrets.json"],
  "npmIgnore": ["internal/", "*.log"]
}
```

---

## Programmatic API

Use secret-scrubber as a library in your own Node.js tools:

### Quick Scrub

```ts
import { scrub } from '@mkhitar/secret-scrubber';

const result = scrub('DATABASE_URL=mongodb+srv://admin:s3cr3t@cluster.example.net/db');

console.log(result.scrubbed);
// "DATABASE_URL=[MONGODB_URI_1]"

console.log(result.stats);
// { totalRedacted: 1, byType: { 'MongoDB URI': 1 } }
```

### Scrub a File

```ts
import { scrubFile } from '@mkhitar/secret-scrubber';

const result = scrubFile('./config.ts', {
  safetyLevel: 'STRICT',
  rules: { redactEmails: true, redactIPs: true },
});
```

### Stable Mapping Across Files

When you scrub multiple files, the same secret always gets the same placeholder:

```ts
import { Redactor } from '@mkhitar/secret-scrubber';

const redactor = new Redactor({ safetyLevel: 'BALANCED' });
const r1 = redactor.scrub(fileA);
const r2 = redactor.scrub(fileB);
// If fileA and fileB share the same API key, it gets the same placeholder in both
```

### All Exports

```ts
import {
  scrub,              // Quick one-shot scrub
  scrubFile,          // Scrub a file by path
  Redactor,           // Core engine (for stable mapping)
  EntropyEngine,      // Shannon entropy scanner
  RegexVault,         // Regex pattern matcher
  SECRET_PATTERNS,    // Built-in patterns array
  PathAnonymizer,     // File path flattener
  Dictionary,         // PII + name detection
  ClipboardAdapter,   // Clipboard scrub utility
  ProjectScanner,     // Project-wide file discovery
  IgnoreAuditor,      // .gitignore audit utility
} from '@mkhitar/secret-scrubber';
```

---

## How It Works

secret-scrubber runs your input through 5 layers:

```
Input
  │
  ▼
┌─────────────────────────┐
│  1. Pattern Matching     │  30+ regex patterns for known secrets
├─────────────────────────┤
│  2. Entropy Analysis     │  Catches unknown secrets via Shannon entropy
├─────────────────────────┤
│  3. PII Detection        │  Emails, phones, credit cards, custom patterns
├─────────────────────────┤
│  4. Name Detection       │  User-provided names (opt-in)
├─────────────────────────┤
│  5. Path Anonymization   │  /Users/you/project → /workspace/project
└─────────────────────────┘
  │
  ▼
Clean output with stable placeholders
```

**Stable placeholders** mean the same secret always maps to the same token (e.g. `[STRIPE_SECRET_KEY_1]`). This preserves code logic so the AI can still reason about your code structure.

---

## Example

**Before:**
```
DATABASE_URL=mongodb+srv://admin:s3cr3t@cluster0.example.net/mydb
Contact: john@example.com or call +1 555 123 4567
Path: /Users/john/Projects/my-app/src/index.ts
```

**After:**
```
DATABASE_URL=[MONGODB_URI_1]
Contact: [EMAIL_3] or call [PHONE_4]
Path: /workspace/my-app/src/index.ts
```

---

## Requirements

- Node.js >= 18.0.0

## License

MIT
