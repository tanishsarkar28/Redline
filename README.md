# Redline

Automated GitHub pull request review bot with a web dashboard, deterministic secret detection, structured LLM code review, and proofreader mark-up annotations.

---

## What It Does

- **Receives GitHub Webhooks:** Listens for `pull_request` (`opened`, `synchronize`, `reopened`) events with cryptographic `X-Hub-Signature-256` HMAC verification and instant HTTP 200 acknowledgment via an asynchronous job queue.
- **Runs as a GitHub Action:** Standalone workflow action (`action/action.yml`) that can review pull requests directly in CI.
- **Diff Parsing & Filtering:** Chunks unified diffs into discrete file hunks, filtering out lockfiles (`package-lock.json`, `yarn.lock`, etc.), binaries, generated assets (`dist/**`, minified JS/CSS, source maps), and ignored glob patterns.
- **Deterministic Secret Scanner & Redaction:** Runs **before** any LLM call. Scans changed lines with deterministic regular expressions (AWS access/secret keys, GitHub personal access tokens, cryptographic private keys, Stripe keys, Slack tokens, `.env` assignments) plus Shannon entropy calculation for high-entropy tokens. Detected secret values are **redacted** (`[REDACTED_...]`) in memory before sending diff chunks to the OpenAI API.
- **Structured LLM Review:** Evaluates changed hunks using OpenAI structured outputs (`response_format: { type: "json_schema" }`) across 5 categories: `bug`, `security`, `secret-exposure`, `performance`, and `style/improvement`.
- **Inline Comments & PR Summary:** Maps findings strictly to lines touched by the diff, posting inline review comments with proposed code replacements (` ```suggestion `), plus an overall summary markdown review table on the PR.
- **SQLite Persistence:** Uses `better-sqlite3` in WAL mode to persist every review run, changed file diff, finding, and webhook event for historical tracking and auditing.
- **Web Dashboard:** Clean, engineer-focused React + Vite + TypeScript dashboard styled with a proofreader's marked-up paper aesthetic (`#f4f1ea` paper / charcoal dark mode, typography-based severity, single editor's red pen `#c8321e` accent).

---

## Architecture

```
Redline/
├── server/
│   ├── index.ts              # Server entrypoint & lifecycle
│   ├── app.ts                # Express setup (raw body HMAC, REST routes, static SPA serving)
│   ├── config.ts             # Environment & defaults
│   ├── db/
│   │   ├── index.ts          # better-sqlite3 database layer
│   │   ├── schema.sql        # SQLite schema (repositories, reviews, findings, files, webhooks, jobs)
│   │   └── seed.ts           # Realistic seed dataset (sample PRs, diffs, findings)
│   ├── pipeline/
│   │   ├── chunker.ts        # Unified diff parser, glob filter, hunk chunker
│   │   ├── secretScanner.ts  # Deterministic regex + Shannon entropy pass, value redaction
│   │   ├── llmReviewer.ts    # OpenAI structured-output review with backoff retry
│   │   ├── commentMapper.ts  # GitHub PR review comment line position mapper & summary markdown
│   │   ├── githubClient.ts   # Octokit wrapper (diff fetching, review posting, status checks)
│   │   └── reviewEngine.ts   # Review orchestration pipeline
│   ├── queue/
│   │   └── jobQueue.ts       # Asynchronous job queue with idempotency keys
│   └── routes/
│       ├── webhooks.ts       # GitHub webhook endpoint with HMAC SHA256 verification
│       └── api.ts            # REST API for dashboard (/api/reviews, /api/repos, /api/settings, /api/simulate)
├── action/
│   ├── action.yml            # GitHub Action definition
│   └── index.ts              # GitHub Action runner entrypoint
├── shared/
│   ├── types.ts              # Domain types (Review, Finding, Repository, etc.)
│   └── schema.ts             # Zod validation schemas & JSON Schema for OpenAI structured outputs
├── web/
│   ├── src/
│   │   ├── index.css         # Redline typography & proofreader theme variables
│   │   ├── App.tsx           # Layout, tab navigation, dark mode, keyboard shortcuts
│   │   ├── components/
│   │   │   ├── Header.tsx    # Header with "last webhook received" indicator
│   │   │   ├── DiffViewer.tsx # Diff viewer with redline proofreader margin notes & strikethroughs
│   │   │   ├── StatusBadge.tsx # Typography-based severity labels
│   │   │   └── KeyboardShortcutsModal.tsx
│   │   └── pages/
│   │       ├── ReviewsPage.tsx        # Dense ledger of PRs reviewed with filter and j/k navigation
│   │       ├── ReviewDetailPage.tsx   # File-grouped diff view with attached redline margin notes
│   │       ├── RepositoriesPage.tsx   # Connected repos, webhook health, config editor
│   │       └── SettingsPage.tsx       # Model, threshold, ignore patterns editor & simulator
├── test/
│   ├── secretScanner.test.ts # Secret scanner regex & entropy tests + redaction verification
│   ├── chunker.test.ts       # Diff parsing, chunking, file skipping tests
│   ├── commentMapper.test.ts # Comment positioning and markdown summary tests
│   └── reviewEngine.test.ts  # Full pipeline integration test
├── .redline.yml              # Sample repository configuration
├── .env.example              # Environment variables template
└── vitest.config.ts          # Vitest test configuration
```

---

## Getting Started

### 1. Prerequisites
- Node.js 20+ (tested on Node 24)
- npm 10+
- OpenAI API Key (or runs in deterministic simulated mode)
- GitHub Personal Access Token or GitHub App

### 2. Installation
```bash
git clone https://github.com/your-username/Redline.git
cd Redline
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your values:
```ini
PORT=3000
HOST=0.0.0.0
WEBHOOK_SECRET=your_github_webhook_secret_here
GITHUB_TOKEN=ghp_your_github_token_here
OPENAI_API_KEY=sk-your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
DATABASE_PATH=./data/redline.db
DEFAULT_SEVERITY_THRESHOLD=low
DEFAULT_MAX_FILES=25
```

### 4. Seed Realistic Sample PRs
Initialize SQLite and populate the database with realistic sample PRs (featuring security flaws, exposed AWS keys, async race conditions, and performance bottlenecks):
```bash
npm run seed
```

### 5. Build and Run
Build the frontend dashboard:
```bash
npm run build:web
```

Start the Redline server (serves both API and the web dashboard):
```bash
npm start
```
Open **http://localhost:3000** in your browser.

For local development with hot reload:
```bash
# Terminal 1: Start Express server with tsx watch
npm run dev

# Terminal 2: Start Vite dev server for the dashboard
npm run dev:web
```

---

## GitHub App & Webhook Setup

### 1. Create a GitHub App
1. Go to **GitHub Settings → Developer Settings → GitHub Apps → New GitHub App**.
2. Name: `Redline Reviewer` (or your choice).
3. Homepage URL: `http://your-server-ip:3000`.
4. **Webhook:**
   - Active: **Checked**.
   - Webhook URL: `http://your-server-ip:3000/api/webhooks/github` (or your public ngrok / domain URL).
   - Webhook secret: enter a random secret string (e.g. `openssl rand -hex 20`) and set it as `WEBHOOK_SECRET` in your `.env`.
5. **Permissions:**
   - **Pull requests:** Read & write
   - **Repository contents:** Read-only
   - **Issues / Comments:** Read & write
6. **Subscribe to events:**
   - Check **Pull request**.
7. Install the App on your repositories.

### 2. Or Use Standard Repository Webhooks
Alternatively, go to your repository **Settings → Webhooks → Add webhook**:
- Payload URL: `http://your-server-ip:3000/api/webhooks/github`
- Content type: `application/json`
- Secret: same as `WEBHOOK_SECRET` in `.env`
- Which events: Select **Let me select individual events** → Check **Pull requests**.

---

## GitHub Action Setup

Add `.github/workflows/redline.yml` to any target repository:

```yaml
name: Redline Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run Redline Review
        uses: ./action # or your-org/redline-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          openai_model: 'gpt-4o-mini'
          severity_threshold: 'low'
          max_files: '25'
          post_review: 'true'
```

---

## Repository Configuration (`.redline.yml`)

Place a `.redline.yml` in the root of any target repository to customize review behavior:

```yaml
# OpenAI Model (gpt-4o-mini, gpt-4o, etc.)
model: gpt-4o-mini

# Minimum severity threshold to post comments: low | medium | high | critical
severity_threshold: low

# Maximum changed files to analyze per pull request
max_files: 25

# Glob patterns to ignore
ignore:
  - "**/*.lock"
  - "package-lock.json"
  - "yarn.lock"
  - "pnpm-lock.yaml"
  - "Cargo.lock"
  - "dist/**"
  - "build/**"
  - "node_modules/**"
  - "**/*.min.js"
  - "**/*.map"

# Secret detection settings
secret_scan:
  enabled: true
  entropy_threshold: 4.5
```

---

## Deterministic Secret Scanner

The deterministic secret scanner evaluates files **before** diffs are formatted for the LLM:
1. Regex pattern matching:
   - AWS Access Key IDs (`AKIA[0-9A-Z]{16}`)
   - AWS Secret Access Keys
   - GitHub Personal Access Tokens (`ghp_`, `github_pat_`, `gho_`)
   - Cryptographic Private Keys (`-----BEGIN RSA/EC/OPENSSH PRIVATE KEY-----`)
   - Stripe API keys (`sk_live_`)
   - Slack tokens (`xoxb-`)
   - Generic `.env` secret assignments (`DB_PASSWORD=...`, `API_KEY=...`)
2. Shannon entropy analysis:
   - Analyzes candidate strings for statistical entropy $> 4.5$ bits/char.
3. Guaranteed Redaction:
   - Every detected secret produces an immediate critical finding and is replaced with a safe token (`[REDACTED_...]`).
   - Plaintext secret values are **never transmitted** to OpenAI.

---

## Keyboard Navigation

| Key | Action |
| :--- | :--- |
| `j` | Focus next finding or table row |
| `k` | Focus previous finding or table row |
| `Enter` | Open selected pull request or expand suggested fix |
| `/` | Focus filter / search input |
| `t` | Toggle paper (`#f4f1ea`) / charcoal (`#161718`) theme |
| `?` | Toggle keyboard shortcuts modal |
| `Esc` | Return to pull request ledger or close modal |

---

## Running Tests

Run the Vitest test suite covering the secret scanner, diff chunker, comment mapper, and review engine:
```bash
npm test
```

Run TypeScript strict type checking:
```bash
npm run typecheck
```
