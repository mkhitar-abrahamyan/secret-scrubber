Technical Specification: @mkhitar99/secret-scrubber
1. Product Overview
@mkhitar99/secret-scrubber is a high-performance privacy middleware and CLI tool designed to prevent sensitive data—such as API keys, Personal Identifiable Information (PII), and local environment paths—from being sent to LLM providers (OpenAI, Anthropic, etc.). It acts as a "Privacy Firewall" that intercepts code or logs before they are copy-pasted or piped into an AI prompt.

Core Philosophy: "Zero-Trust Context." What the AI doesn't know, the provider can't leak.

2. Core Architecture & Execution Flow
The scrubber operates as a high-speed stream processor that uses a multi-layered detection engine to identify and redact sensitive tokens.

Step-by-Step Execution:
Ingestion: The tool receives input via CLI pipe (cat file.js | scrubber), file-system watch, or a programmatic Node.js function.

Entropy Analysis: It scans for high-entropy strings (random-looking sequences) that typically represent AWS keys, Stripe secrets, or JWTs.

Regex Pattern Matching: It applies a library of 150+ "Secret Signatures" (standardized patterns for DB URIs, SSH keys, etc.).

Environment Anonymization: It identifies local machine-specific paths (e.g., /Users/mkhitar/Projects/...) and replaces them with generic virtual paths.

Redaction/Placeholder Injection: Sensitive tokens are replaced with stable placeholders (e.g., [SECRET_ID_1]) so that the AI can still reference the variable logically without knowing the value.

3. The "Claw" Edge: Undercover & Anonymization Logic
Inspired by the "Undercover Mode" and identity-masking features found in the Claude Code leak, this tool goes beyond simple regex to provide true environmental anonymity.

Identity Masking: It automatically detects and redacts the developer's name, local username, and Armenian-specific identifiers (like Armenian phone numbers or local bank account formats) to prevent the AI from building a profile of the user.

Path Flattening: It transforms local absolute paths into a "Virtual Workspace" structure. Instead of seeing your local folder hierarchy, the AI sees a clean, root-level project structure, preventing it from knowing your OS or directory layout.

Stable Token Mapping: If the same secret appears 10 times in a file, it is replaced with the same placeholder. This allows the AI to understand that the "Secret" is a consistent variable, maintaining the logical flow of the code for debugging.

4. Package File Structure
Plaintext
secret-scrubber/
├── bin/
│   └── scrub.js                # CLI binary (npx scrubber)
├── src/
│   ├── engines/
│   │   ├── entropy.ts          # Shannon Entropy calculation
│   │   ├── regex-vault.ts      # 150+ pre-defined secret patterns
│   │   └── path-anonymizer.ts  # Logic for flattening local paths
├── core/
│   ├── redactor.ts             # Main replacement & mapping logic
│   └── dictionary.ts           # PII detection (Names, Emails, Phones)
├── adapters/
│   └── clipboard.ts            # "Scrub & Copy" utility
├── package.json
├── tsconfig.json
└── README.md
5. Configuration Standard (scrubber.config.json)
Allows developers and companies to define what "Sensitive" means for their specific project:

JSON
{
  "rules": {
    "redactEmails": true,
    "redactIPs": true,
    "redactLocalPaths": true,
    "customPatterns": [
      {
        "name": "Armenian-Bank-ID",
        "pattern": "(?i)AM\\d{21}",
        "placeholder": "[LOCAL_BANK_ACCOUNT]"
      }
    ]
  },
  "safetyLevel": "STRICT", // RELAXED | BALANCED | STRICT
  "exclude": ["public/assets/**"]
}
6. Technical Implementation Details
As a Senior Developer, you’ll appreciate the performance focus of this build:

Streaming Regex: Uses a "One-Pass" scanning algorithm to ensure that even a 10,000-line log file is scrubbed in under 50ms.

Shannon Entropy Scoring: To find "Unknown Secrets," it calculates the randomness of strings. Any string over 12 characters with an entropy score > 4.5 is flagged as a potential API key.

AST-Aware Redaction (Optional): Integration with ts-morph to specifically target process.env variables and hardcoded string literals while ignoring safe code comments.

Local PII Dictionary: Includes a specific dictionary for the Armenian market (detecting Armenian names and "+374" phone formats) ensuring your local identity is protected when working with global LLMs.

7. Monetization Strategy
Tier 1: Open Source Utility (Free)
The CLI tool for individual developers.

All standard secret patterns (AWS, Stripe, Google).

Goal: Become the "standard" tool for developers who care about privacy, ranking high on NPM for "AI Privacy" keywords.

Tier 2: The "Enterprise Proxy" (Paid SaaS)
Target Audience: Companies in Armenia and Europe that use "Bring Your Own Key" (BYOK) for AI.

Features: A central dashboard where the CTO can see "Privacy Reports" (e.g., "Last month, the scrubber blocked 450 leaked API keys from being sent to OpenAI").

Compliance: Generate "GDPR/SOC2 Proof of Anonymization" reports automatically.

Tier 3: The IDE Extension (Paid/Freemium)
A VS Code extension that highlights "Dangerous Data" in red as the developer types, with a "Quick-Scrub" button before they hit "Send" in their AI sidebar.