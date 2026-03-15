# Visual Branch Comparator — Specification

> **Status**: DRAFT — needs brainstorming finalization before implementation
> **Date**: 2026-03-15
> **Author**: KO (AI Overseer) + Claude (Research)

## 1. What Is This

A **local web tool** that shows how your app/website LOOKS on different git branches — side by side in the browser, with highlighted visual differences and plain-language descriptions of what changed.

**Analogy**: Like a TV with picture-in-picture — but instead of TV channels, you see two (or three) versions of your website from different branches.

**Who it's for**: Non-coders who need to make git decisions (merge, cherry-pick, which branch looks better) without understanding code.

## 2. Problem Statement

Existing git tools show CODE diffs — colored text, added/removed lines. This is useless for someone who doesn't code. KO needs to see the VISUAL result: what does the page actually look like? What changed visually?

**No existing tool does this.** Verified across 50+ tools, 14 independent organizations (see Research section). The closest tools solve adjacent problems:

- Vercel/Netlify: deploy previews in separate tabs (no comparison)
- Chromatic/Percy: CI-based screenshot comparison (not live, developer-focused)
- CodeRabbit: AI PR summaries (text only, no visual)

## 3. Core Use Cases

### UC1: Pre-Merge Review

> "AI finished a feature branch. Does it look right before I merge?"

1. Open comparator → select `main` vs `feature-cart`
2. Wait ~30 seconds for build
3. See both versions side by side
4. Click "Show Diff" → red highlights on changed areas
5. Click "Describe" → "Added shopping cart icon to header. New /cart page with product list."
6. Decide: merge or send back for changes

### UC2: Monitor AI Development

> "Claude Code is working on a redesign. I want to see progress live."

1. Open comparator → `main` vs `feature-redesign` (live mode)
2. AI saves changes → page auto-refreshes in iframe
3. Watch changes appear in real time
4. If something looks wrong → tell AI to fix it immediately

### UC3: Compare Multiple Approaches

> "Three branches have different design approaches. Which one looks best?"

1. Add three branches to comparator
2. See all three side by side
3. Compare visually → pick the winner

### UC4: Flutter Web Preview

> "Flutter app has a new feature branch. How does it look?"

1. Same workflow as UC1, but build takes ~60 seconds (Flutter web build)
2. Served as static files — same comparison UI

## 4. Features (Prioritized)

### MVP (Phase 1 — ~1 week)

| #   | Feature                   | Description                                                        |
| --- | ------------------------- | ------------------------------------------------------------------ |
| F1  | **Branch selector**       | Dropdown with all branches in repo. Add/remove to comparison.      |
| F2  | **Side-by-side iframes**  | 2-3 live rendered pages, each from a different branch              |
| F3  | **Build mode**            | `next build && next start` per branch (~30s). Production-accurate. |
| F4  | **Pixel diff overlay**    | Screenshot both branches → pixelmatch → red highlight of changes   |
| F5  | **AI change description** | LLM reads git diff + screenshots → plain-language bullet points    |
| F6  | **Status bar**            | Which branches are built/building/errored. Last update time.       |

### V2 (Phase 2 — ~1 week)

| #   | Feature                 | Description                                                  |
| --- | ----------------------- | ------------------------------------------------------------ |
| F7  | **N branches**          | Compare more than 2 branches simultaneously                  |
| F8  | **Auto-refresh**        | Detect new commits → auto-rebuild → refresh                  |
| F9  | **Synced navigation**   | Click link in one iframe → all iframes navigate to same path |
| F10 | **Diff slider**         | Drag slider to blend between version A and B                 |
| F11 | **Session persistence** | Remember which branches were open last time                  |

### V3 (Phase 3 — future)

| #   | Feature              | Description                                                  |
| --- | -------------------- | ------------------------------------------------------------ |
| F12 | **Live mode**        | `next dev` per branch — instant hot reload, more RAM         |
| F13 | **Framework config** | `comparator.config.json` — support Angular, Vite, Nuxt, etc. |
| F14 | **Component focus**  | Compare single UI element (header, form) across branches     |
| F15 | **History timeline** | How a branch looked yesterday vs today                       |
| F16 | **Flutter support**  | `flutter build web` per branch                               |

## 5. What This Tool Does NOT Do

- Does NOT merge branches — only shows visual comparison
- Does NOT edit code — it's a window for looking, not an editor
- Does NOT replace GitHub PRs — it supplements them with visual context
- Does NOT run in the cloud — local tool on your Mac
- Does NOT require understanding code — that's the whole point

## 6. Architecture

### High-Level

```
┌─────────────────────────────────────────────────┐
│         COMPARATOR UI (Next.js, port 4000)       │
│                                                   │
│  [Branch Selector]  [View Mode: Side|Diff|AI]    │
│                                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ iframe   │ │ iframe   │ │ iframe   │           │
│  │ :3001    │ │ :3002    │ │ :3003    │           │
│  │ (main)   │ │ (feat-a) │ │ (feat-b) │           │
│  └─────────┘ └─────────┘ └─────────┘           │
│                                                   │
│  [Diff Overlay]  [AI Description]  [Status Bar]  │
└─────────────────────────────────────────────────┘
        │ API calls
        ▼
┌─────────────────────────────────────────────────┐
│              BACKEND (Node.js API)                │
│                                                   │
│  Worktree Manager ──► Server Spawner             │
│       │                    │                      │
│       ▼                    ▼                      │
│  git worktree        child_process.spawn         │
│  add/remove          next build/start            │
│                                                   │
│  Screenshot Engine ──► Diff Engine               │
│  (Playwright)          (pixelmatch)              │
│                                                   │
│  Description Engine                               │
│  (Claude API → human-readable changes)           │
└─────────────────────────────────────────────────┘
```

### Backend Modules (~500 lines total)

#### 6.1 Worktree Manager

- `addBranch(branchName)` → `git worktree add` + `pnpm install` + assign port
- `removeBranch(branchName)` → kill server + `git worktree remove`
- `listBranches()` → `[{branch, worktreePath, port, status, pid}]`
- State stored in `~/.comparator/state.json`
- Port assignment: deterministic hash from branch name (3001-3099)

#### 6.2 Server Spawner

- `startServer(worktreePath, port, mode)` → `child_process.spawn`
- `healthCheck(port)` → poll `GET /` until HTTP 200
- `stopServer(pid)` → `process.kill(pid, 'SIGTERM')`
- Modes: `build` (next build + next start) or `live` (next dev)

#### 6.3 Screenshot Engine

- `capture(url, options)` → Playwright `page.screenshot({fullPage: true})`
- `captureAll(branches)` → parallel capture of all branch URLs
- Shared browser instance (launch once, reuse)

#### 6.4 Diff Engine

- `compare(imgA, imgB, threshold?)` → `{diffImage: Buffer, changedPixels: number, percentChanged: number}`
- Uses pixelmatch (zero dependencies, MIT)
- Configurable threshold (default 0.1)

#### 6.5 Description Engine

- Input: `git diff branchA..branchB` + screenshot pair
- LLM prompt → plain-language bullet points
- Uses Claude API (Haiku model for speed)
- Fallback: show raw pixel diff stats if API unavailable

### Frontend (Next.js App Router)

#### Pages

- `/` — Dashboard: branch list, add/remove, status overview
- `/compare` — Main comparison view: iframes + diff + description

#### Components

- `BranchSelector` — dropdown with repo branches, add/remove buttons
- `IframePanel` — resizable iframe container per branch
- `DiffOverlay` — shows pixelmatch diff image with slider
- `ChangeDescription` — AI-generated description panel
- `StatusBar` — build status, server health, timestamps

## 7. Technical Decisions (Verified by Research)

| Decision            | Choice                            | Why                                                     | Research Source  |
| ------------------- | --------------------------------- | ------------------------------------------------------- | ---------------- |
| Branch isolation    | Git worktrees                     | Shared .git store, 5-20KB overhead per branch           | Verified ✅      |
| Server per branch   | child_process.spawn               | PM2 has bug #4965                                       | Verified ✅      |
| Visual diff         | pixelmatch                        | Zero deps, MIT, used by Playwright                      | Verified ✅      |
| Screenshots         | Playwright                        | Industry standard, cross-browser                        | Verified ✅      |
| Iframes for preview | Yes, works cross-origin           | Different ports = cross-origin but rendering allowed    | Verified ✅      |
| Default mode        | Build mode                        | Less RAM, production-accurate, works for all frameworks | Decision         |
| Package manager     | pnpm (standard, not global store) | Global store is experimental with bugs                  | Verified risk ⚠️ |
| LLM                 | Claude API (Haiku)                | Fast, cheap, good quality                               | Decision         |
| Fork Lost Pixel?    | NO                                | Would need 90% rewrite; just import pixelmatch directly | Verified ✅      |

## 8. Framework Extensibility (V3)

The tool is framework-agnostic in build mode. Each project defines a `comparator.config.json`:

```json
{
  "name": "My Next.js App",
  "build": "pnpm build",
  "start": "pnpm start -- -p ${PORT}",
  "healthCheck": "/",
  "installDeps": "pnpm install"
}
```

Examples for other frameworks:

```json
// Angular
{ "build": "ng build", "start": "npx serve dist/app -p ${PORT}" }

// Vite + React
{ "build": "vite build", "start": "vite preview --port ${PORT}" }

// Flutter Web
{ "build": "flutter build web", "start": "npx serve build/web -p ${PORT}" }

// Nuxt
{ "build": "nuxt build", "start": "node .output/server/index.mjs" }
```

## 9. Iframe Configuration (Required)

Each project being compared needs this in `next.config.js` (or equivalent):

```javascript
module.exports = {
  allowedDevOrigins: ['localhost:4000'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' http://localhost:*" },
        ],
      },
    ];
  },
};
```

This is only needed for development — the comparator injects this config automatically when creating worktrees (by patching next.config.js in the worktree).

## 10. Risks and Mitigations

| Risk                          | Likelihood | Impact       | Mitigation                                              |
| ----------------------------- | ---------- | ------------ | ------------------------------------------------------- |
| RAM pressure (3+ servers)     | High       | Slowdown     | Build mode: 100-200MB each. Limit to 3 branches.        |
| Port conflicts                | Medium     | Server fails | Deterministic hash + retry on next port                 |
| pnpm install slow             | Medium     | 2-3 min wait | pnpm shared cache. Pre-warm main branch.                |
| Iframe won't load             | Low        | No preview   | Fallback: screenshot-only mode                          |
| pixelmatch false positives    | Medium     | Noisy diffs  | Threshold tuning (0.1-0.3). Mask timestamps/animations. |
| LLM hallucinated descriptions | Medium     | Misleading   | Show pixel stats as ground truth alongside AI text      |

## 11. Technology Stack

| Component          | Technology                       | Version |
| ------------------ | -------------------------------- | ------- |
| Comparator UI      | Next.js (App Router)             | 15.x    |
| Git operations     | simple-git                       | latest  |
| Process management | child_process (Node.js built-in) | —       |
| Screenshots        | Playwright                       | 1.42+   |
| Pixel diff         | pixelmatch                       | 6.x     |
| LLM descriptions   | Claude API (Haiku)               | —       |
| Real-time updates  | WebSocket (ws)                   | —       |
| State persistence  | JSON file                        | —       |
| Package manager    | pnpm                             | 9.x     |
| Language           | TypeScript                       | 5.x     |

## 12. Open Questions (To Resolve in Brainstorming)

- [ ] **Comparator as standalone CLI or npm package?** How does user start it? `npx visual-branch-comparator`? Global install? Script in project?
- [ ] **Where do worktrees live?** Adjacent to project (`../project-branches/`) or in temp dir?
- [ ] **UI design**: Minimal dashboard or more polished? Dark mode? Responsive?
- [ ] **Navigation sync**: How to sync URL between iframes? postMessage? URL bar in comparator?
- [ ] **Multiple projects**: Can the comparator manage multiple repos or is it one-repo-at-a-time?
- [ ] **Vercel integration**: Worth building cloud mode (Vercel preview URLs) in addition to local mode?

---

## Research References

Full research archives with 30+ verified sources:

- **Landscape Scan**: `~/ai/websearch/archive/2026-03/2026-03-15_visual-branch-comparator-landscape.md`
- **MVP Deep-Dive**: `~/ai/websearch/archive/2026-03/2026-03-15_visual-branch-comparator-mvp-deep-dive.md`

Key verified facts:

- No existing tool does live side-by-side branch rendering (verified across 14 orgs)
- Iframes render cross-origin localhost content (MDN confirmed)
- Git worktrees share .git store with 5-20KB overhead per worktree (git docs confirmed)
- pixelmatch is zero-dependency MIT library used by Playwright (GitHub confirmed)
- Lost Pixel fork NOT recommended — 90% rewrite needed (architecture analysis confirmed)
- PM2 increment_var has bug #4965 — use child_process.spawn instead (GitHub issue confirmed)
- pnpm global virtual store is experimental — use standard mode (docs confirmed)
