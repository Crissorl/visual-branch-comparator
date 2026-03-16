# Visual Branch Comparator

Compare how your web app looks across different git branches — side by side in the browser, with pixel diff overlays and AI-generated change descriptions.

## Features

- **Side-by-side preview**: View two branches simultaneously in iframes
- **Branch & commit selection**: Pick any branch or specific commit
- **Visual diff overlay**: Pixel-level comparison using pixelmatch
- **AI change descriptions**: Plain-language summaries of visual changes via Claude API
- **Git diff viewer**: Syntax-highlighted code diff
- **Synchronized navigation**: Navigate in one iframe, both follow
- **Dark/Light mode**: System preference detection with manual override
- **Process lifecycle**: Graceful shutdown and crash recovery
- **CLI entry point**: Auto-opens browser on startup

## Quick Start

```bash
# Clone and install
git clone https://github.com/Crissorl/visual-branch-comparator.git
cd visual-branch-comparator
pnpm install

# Start the comparator
pnpm dev
```

Then open http://localhost:4000 and select two branches to compare.

## Usage

### As a CLI tool

```bash
npx vbc              # Start on default port 4000
npx vbc --port 3000  # Custom port
npx vbc --no-open    # Don't auto-open browser
```

### AI Descriptions

Set your Anthropic API key to enable AI-powered change descriptions:

```bash
export ANTHROPIC_API_KEY=your-key-here
```

Without the key, the tool works fully — AI descriptions simply show a fallback message.

## How It Works

1. **Worktree Manager**: Creates git worktrees for each selected branch
2. **Server Spawner**: Builds and starts each branch on a unique port (3001-3099)
3. **Config Patcher**: Auto-injects iframe headers and nav sync scripts
4. **Screenshot Engine**: Captures pages via Playwright (optional)
5. **Diff Engine**: Compares screenshots with pixelmatch
6. **Description Engine**: Sends git diff to Claude Haiku for plain-language summaries

## Tech Stack

- **Framework**: Next.js 15 (App Router), TypeScript
- **Git operations**: simple-git
- **Screenshots**: Playwright (optional dependency)
- **Visual diff**: pixelmatch + pngjs
- **AI**: @anthropic-ai/sdk (Claude Haiku)
- **Styling**: Tailwind CSS v4

## Development

```bash
pnpm dev        # Start dev server
pnpm build      # Production build
pnpm typecheck  # TypeScript check
pnpm lint       # ESLint
```

## Documentation

- **[Specification](docs/SPEC.md)** — Complete feature list, architecture, and technical decisions
- **[Design Document](docs/superpowers/specs/2026-03-15-visual-branch-comparator-design.md)** — Implementation details and design rationale

## License

MIT
