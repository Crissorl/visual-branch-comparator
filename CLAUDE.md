# Visual Branch Comparator

## What Is This

A local web tool for visually comparing how a web app looks across different git branches — side by side in the browser, with pixel diff overlays and AI-generated plain-language change descriptions. Built for non-coders making merge decisions.

## Status

**Phase**: MVP Complete
**Repo**: https://github.com/Crissorl/visual-branch-comparator
**Spec**: `docs/SPEC.md`
**Design**: `docs/superpowers/specs/2026-03-15-visual-branch-comparator-design.md`

## GitHub Issues

- Backlog tracked in GitHub Issues with milestones: MVP (Phase 1), V2 (Phase 2), V3 (Phase 3)
- Labels: `feature`, `infra`, `bug`, `docs`, `design`
- One issue per feature from spec (F1-F10) + infra + docs
- Branch naming: `dev` for active work, PRs to `main`

## Tech Stack

- **UI**: Next.js 15 (App Router), TypeScript
- **Git**: simple-git (npm)
- **Process management**: child_process.spawn (NOT PM2 — bug #4965)
- **Screenshots**: Playwright
- **Visual diff**: pixelmatch
- **LLM descriptions**: Claude API (Haiku)
- **Package manager**: pnpm (standard mode, NOT experimental global store)

## Architecture Summary

```
Comparator UI (port 4000)
  ├── iframes showing branches on ports 3001-3099
  ├── pixelmatch diff overlay (server-side screenshots)
  └── AI change descriptions (Claude API)

Backend
  ├── Worktree Manager (git worktree add/remove)
  ├── Server Spawner (child_process.spawn per branch)
  ├── Screenshot Engine (Playwright)
  ├── Diff Engine (pixelmatch)
  └── Description Engine (Claude API → plain language)
```

## Key Research-Backed Decisions

- **Don't fork Lost Pixel** — its architecture (baseline-only, CI-triggered) requires 90% rewrite. Just import pixelmatch directly.
- **Git worktrees** for branch isolation — shared .git store, 5-20KB per worktree.
- **Iframes work** cross-origin on localhost — different ports are cross-origin but rendering is allowed.
- **Build mode first** — `next build && next start` is simpler, more accurate, less RAM than dev mode.
- **Deterministic port hashing** — branch name → consistent port. No PM2.

## Dev Commands

```bash
# Start comparator (once implemented)
pnpm dev           # Starts comparator UI on port 4000

# Development
pnpm build         # Build comparator
pnpm lint          # Lint
pnpm typecheck     # TypeScript check
```

## Research References

Full verified research (30+ sources, 2 clean-room verifications):

- `~/ai/websearch/archive/2026-03/2026-03-15_visual-branch-comparator-landscape.md`
- `~/ai/websearch/archive/2026-03/2026-03-15_visual-branch-comparator-mvp-deep-dive.md`
