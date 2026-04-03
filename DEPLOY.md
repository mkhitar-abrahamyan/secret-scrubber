# Deployment Guide: Publishing @mkhitar99/secret-scrubber to npm

> **Internal document** — not included in the published npm package.

## Prerequisites

1. **npm account** — Create one at [npmjs.com](https://www.npmjs.com/signup)
2. **npm CLI logged in** — Run `npm login`
3. **npm org** — Create the `@mkhitar99` org at [npmjs.com/org/create](https://www.npmjs.com/org/create) (if not already done)

## Step-by-Step Publish

```bash
# 1. Navigate to the package
cd secret-scrubber

# 2. Install dependencies
npm install

# 3. Build the TypeScript
npm run build

# 4. Verify the package contents
npm pack --dry-run

# 5. Publish (first time — public scoped package)
npm publish --access public

# 6. Verify it's live
npm info @mkhitar99/secret-scrubber
```

## Updating the Package

```bash
# Bump version (patch/minor/major)
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0

# Rebuild and publish
npm run build
npm publish --access public
```

## CI/CD with GitHub Actions

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Add your npm token as `NPM_TOKEN` in GitHub repo Settings → Secrets.

## Registry Notes

- Scoped packages default to **private** — always use `--access public`
- To unpublish: `npm unpublish @mkhitar99/secret-scrubber@1.0.0` (within 72h only)
- To deprecate: `npm deprecate @mkhitar99/secret-scrubber@1.0.0 "Use v2 instead"`
