# Visual Branch Comparator

A local web tool for visually comparing how a web app looks across different git branches — side by side in the browser, with pixel diff overlays and AI-generated plain-language change descriptions. Built for non-coders making merge decisions.

## Status

**In Development — MVP**

## Architecture

```
User runs: vbc
         │
         ▼
┌─────────────────────────────────────────────┐
│        VBC (Next.js App, port 4000)          │
│                                               │
│  ┌─────────────┐  ┌─────────────┐            │
│  │ Source       │  │ Theme       │            │
│  │ Selector    │  │ Toggle      │            │
│  └─────────────┘  └─────────────┘            │
│                                               │
│  ┌──────────────────┐ ┌──────────────────┐   │
│  │ iframe :3001     │ │ iframe :3002     │   │
│  │ (main@latest)    │ │ (feature@abc123) │   │
│  │                  │ │ + diff overlay   │   │
│  └──────────────────┘ └──────────────────┘   │
│                                               │
│  [Sync ON/OFF] [Show Diff] [Refresh]         │
│                                               │
│  ┌──────────────────────────────────────┐    │
│  │ Change Panel                         │    │
│  │ [Git Diff] [AI Description]          │    │
│  └──────────────────────────────────────┘    │
│                                               │
│  Status: 2 sources active | Built 12s ago    │
└─────────────────────────────────────────────┘
         │ manages
         ▼
┌──────────────┐  ┌──────────────┐
│ Branch server │  │ Branch server │
│ port 3001    │  │ port 3002    │
│ (main)       │  │ (feature)    │
└──────────────┘  └──────────────┘
```

## Tech Stack

- **UI**: Next.js 15 (App Router), TypeScript
- **Git**: simple-git
- **Process management**: child_process.spawn
- **Screenshots**: Playwright (optional)
- **Visual diff**: pixelmatch
- **AI descriptions**: Claude API (Haiku)
- **Package manager**: pnpm

## Documentation

- [Specification](docs/SPEC.md)
- [MVP Design](docs/superpowers/specs/2026-03-15-visual-branch-comparator-design.md)
