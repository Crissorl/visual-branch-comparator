# Visual Branch Comparator — MVP Design

> **Status**: Approved design
> **Date**: 2026-03-15
> **Author**: KO (AI Overseer) + Claude (Design)

## 1. What We're Building

A local web tool that shows how your app looks on different git branches (or commits) side by side in the browser, with pixel diff overlay and AI-generated change descriptions.

**User**: KO — non-coder making git decisions (merge, cherry-pick, which version looks better).

**Command**: `vbc` (installed globally via `pnpm add -g visual-branch-comparator`)

## 2. MVP Features

| # | Feature | Description |
|---|---------|-------------|
| F1 | **Source selector** | Dropdown: pick branch + optionally specific commit (default: latest). Shows commit list with date + message. |
| F2 | **Side-by-side iframes** | 2 live rendered pages, each from a different branch/commit |
| F3 | **Build mode** | `next build && next start` per source. Production-accurate. |
| F4 | **Pixel diff overlay** | Screenshot both → pixelmatch → semi-transparent red overlay on feature iframe |
| F5 | **Change panel** | Git diff (default view) + AI description toggle (Claude API Haiku) |
| F6 | **Status bar** | Build status, server health, timestamps, diff percentage |
| F7 | **Nav sync** | Auto-sync navigation between iframes via postMessage. Toggle ON/OFF. |
| F8 | **Dark/Light mode** | Theme toggle. Manual override + system preference detection. Persists in localStorage. |
| F9 | **Manual refresh** | Button to rebuild branch and refresh iframe |
| F10 | **Framework config** | `comparator.config.json` from day 1 (Next.js preset only for MVP) |

## 3. User Flows

### Flow 1: First-time use (happy path)
```
1. User runs `vbc` in their Next.js project directory
2. VBC opens browser at http://localhost:4000
3. Dashboard shows: list of git branches, empty comparison area
4. User selects "main" in left dropdown → VBC starts building main
5. Status bar: "Building main... (pnpm install → next build)"
6. After ~30-60s: iframe shows live main branch, status: "● running"
7. User selects "feature-cart" in right dropdown → same build process
8. Both iframes visible side by side
9. User clicks "Show Diff" → screenshots taken → red overlay appears on right iframe
10. Change panel below shows git diff; user toggles "AI Description" for plain-language summary
```

### Flow 2: Compare two commits on same branch
```
1. User selects "main" in left dropdown, picks commit from 3 days ago
2. User selects "main" in right dropdown, keeps "latest"
3. VBC builds both versions → side by side comparison of same branch at different points
```

### Flow 3: Error — build fails
```
1. User adds a branch with broken code
2. VBC shows: status "● build failed" in red
3. Clicking the status shows build log output (last 50 lines)
4. Iframe shows placeholder: "Build failed. Check logs below."
5. User can still interact with the other (working) branch
```

### Flow 4: Error — not a git repo
```
1. User runs `vbc` in a non-git directory
2. Terminal shows: "Error: No git repository found in /path/to/dir. Run vbc from inside a git project."
3. VBC exits with code 1
```

## 4. Acceptance Criteria

### F1 Source Selector
- Shows all local branches sorted by last commit date
- Each branch shows: name, last commit message (truncated to 60 chars), relative time ("2h ago")
- Commit picker: shows last 50 commits for selected branch
- Search/filter by typing branch name (filter as you type)

### F3 Build Mode
- Builds run sequentially (one at a time) to avoid RAM/CPU saturation
- Health check: poll every 1s, timeout after 180s, then mark as failed
- On timeout: kill the build process, show error with last 50 lines of build output
- Status bar shows: "Building... (elapsed: 45s)"

### F4 Pixel Diff Overlay
- Viewport: 1280x720 default for screenshots
- Full-page screenshot (scrolls entire page)
- Size mismatch: pad shorter screenshot with white to match taller one
- Overlay: semi-transparent red (`rgba(255, 0, 0, 0.4)`) on top of the live iframe as a positioned `<img>` element
- Toggle: click "Show Diff" to show, click again to hide
- Shows "X% pixels changed" badge

### F5 Change Panel
- Default tab: git diff (syntax highlighted, scrollable)
- AI tab: bullet points in plain language (3-8 bullets)
- AI prompt includes: git diff (max 5000 chars, truncated with note) + both screenshots
- Example AI output: "Added shopping cart icon in the header (top-right). New /cart page showing 3 products in a grid layout. Footer background color changed from gray to dark blue."
- If ANTHROPIC_API_KEY not set: AI tab shows "Set ANTHROPIC_API_KEY to enable AI descriptions"

### F7 Nav Sync
- Default: ON
- When ON: navigating in one iframe changes path in all others
- When path doesn't exist in other branch: that iframe shows its own 404 (no special handling)
- Query params and hash fragments are forwarded as-is

## 5. Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Distribution | `pnpm add -g`, command `vbc` | Install once, use everywhere |
| Worktrees location | `.comparator/worktrees/` in project | Everything in one place, gitignored |
| Architecture | Next.js monolith (port 4000) | One process, one command, less moving parts |
| UI theme | Dark + Light mode (toggle) | User preference |
| Nav sync | postMessage with ON/OFF toggle | Auto-sync default, manual fallback if broken |
| Diff view | Overlay on feature iframe | Space-efficient, changes shown in context |
| Change panel | Git diff (default) + AI toggle | Code first, AI explanation on demand |
| Scope | One project at a time | Simple mental model |
| Frameworks | Config from day 1, Next.js preset | Architecture ready for future frameworks |
| Source selection | Branch + optional commit | Compare any two points in git history |
| Vercel/cloud | Not now | Local only, cloud in future |

## 6. CLI Interface

```bash
vbc                    # Start VBC in current directory (auto-detects git repo)
vbc --port 5000        # Custom port (default: 4000)
vbc --help             # Show help
```

VBC auto-detects the git repo from `cwd`. If not in a git repo, exits with error and instructions.

## 7. Architecture

### High-Level

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
│  [🔗 Sync ON/OFF] [📸 Show Diff] [🔄 Refresh]│
│                                               │
│  ┌──────────────────────────────────────┐    │
│  │ Change Panel                         │    │
│  │ [Git Diff] [AI Description]          │    │
│  │                                      │    │
│  │ diff --git a/components/Header.tsx   │    │
│  │ + <CartIcon count={items.length} />  │    │
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

### API Endpoints (Next.js API Routes)

```
GET  /api/branches              → list all git branches with last commit info
GET  /api/branches/:name/commits → list last 50 commits for branch
POST /api/sources               → add source (branch + optional commit) → starts build
DELETE /api/sources/:id          → remove source → stops server, removes worktree
GET  /api/sources               → list active sources with status
POST /api/sources/:id/refresh   → rebuild and restart source
POST /api/diff                  → {sourceA, sourceB} → take screenshots, run pixelmatch, return diff image + stats
POST /api/describe              → {sourceA, sourceB} → git diff + screenshots → AI description
GET  /api/sources/:id/logs      → last 100 lines of build/server output
GET  /api/health                → VBC health check
```

**Response format:** JSON. Errors return `{error: string, details?: string}` with appropriate HTTP status.

### Backend Modules (in `lib/`)

#### Worktree Manager (`lib/worktree-manager.ts`)
- `addSource(branch, commitHash?)` → `git worktree add` + run install command from config + assign port
- `removeSource(id)` → kill server + `git worktree remove`
- `listSources()` → `[{id, branch, commit, worktreePath, port, status, pid, lastBuildTime}]`
- Reads `comparator.config.json` for install command (default: `pnpm install`)
- Port assignment: deterministic hash from source identifier (3001-3099). Before binding, check port is free (`net.createServer` test). Retry next port on conflict (max 10 retries).
- State: `.comparator/state.json` (project-local, alongside worktrees)
- **Startup cleanup:** On VBC start, scans `state.json` for stale entries (dead PIDs via `kill(pid, 0)`, orphaned worktrees) and cleans them up. Resilient to missing or corrupted state file — rebuilds state by scanning `.comparator/worktrees/` directory.

#### Server Spawner (`lib/server-spawner.ts`)
- `startServer(worktreePath, port)` → reads `comparator.config.json` → `child_process.spawn`
- `healthCheck(port, timeout=180s, interval=1s)` → poll config's `healthCheck` path until HTTP 200. On timeout: kill process, return error with last 50 lines of stdout/stderr.
- `stopServer(pid)` → `process.kill(pid, 'SIGTERM')`, wait 5s, then `SIGKILL` if still alive
- **Logging:** Capture child process stdout/stderr to `.comparator/logs/<source-id>.log` (rolling, max 1000 lines). Exposed via `/api/sources/:id/logs`.
- **Config patching:** Patches next.config in worktree to allow iframe embedding. See Section 9 for details.

#### Screenshot Engine (`lib/screenshot-engine.ts`)
- `capture(url, viewport={width: 1280, height: 720})` → Playwright `page.screenshot({fullPage: true})`
- `captureAll(sources)` → parallel capture
- Shared browser instance (launch once, reuse). Closed on VBC shutdown.
- **Optional dependency:** If Playwright is not installed, diff features show "Install Playwright to enable visual diff: npx playwright install chromium". Iframe preview still works.

#### Diff Engine (`lib/diff-engine.ts`)
- `compare(imgA, imgB, threshold?)` → `{diffImage: Buffer, changedPixels, percentChanged}`
- Uses pixelmatch (zero dependencies, MIT)
- Default threshold: 0.1
- **Size mismatch:** Pad shorter image with white (`#ffffff`) pixels to match taller one. Both captured at same viewport width (1280px), so width always matches.

#### Description Engine (`lib/description-engine.ts`)
- Input: `git diff branchA..branchB` (max 5000 chars) + screenshot pair
- Output: plain-language bullet points (3-8 items)
- **API key:** Read from `ANTHROPIC_API_KEY` env var. If not set, AI toggle hidden in UI.
- Fallback: pixel diff stats if API unavailable or errors
- Example output: "Added shopping cart icon in the header (top-right). New /cart page with product grid. Footer color changed from gray to dark blue."

### Frontend (in `app/` and `components/`)

#### Pages
- `/` — Dashboard: source list, add/remove, status overview
- `/compare` — Main comparison view: iframes + diff + description

#### Components
- `SourceSelector` — branch dropdown with search/filter + commit picker (date + message)
- `IframePanel` — resizable iframe container per source
- `DiffOverlay` — pixelmatch diff as semi-transparent `<img>` over iframe (toggle)
- `ChangePanel` — tabbed: git diff (syntax highlighted) + AI description
- `StatusBar` — build status, health, timestamps, diff percentage
- `NavSyncToggle` — sync/unsync navigation between iframes
- `ThemeToggle` — dark/light mode switch
- `BuildLog` — expandable panel showing last 50 lines of build output (on error)

### Frontend-Backend Communication

- API calls via `fetch` to Next.js API routes (same origin, no CORS)
- Build status updates: poll `/api/sources` every 2s while any source has status "building"
- No WebSocket in MVP — polling is sufficient for manual refresh flow

## 8. Framework Config

`comparator.config.json` (shipped with VBC, Next.js preset):

```json
{
  "name": "Next.js",
  "install": "pnpm install",
  "build": "pnpm build",
  "start": "pnpm start -p ${PORT}",
  "healthCheck": "/",
  "env": {
    "NEXT_TELEMETRY_DISABLED": "1"
  }
}
```

**Config resolution:** Project root `comparator.config.json` overrides built-in preset. If no project config exists, VBC uses the built-in Next.js preset (no error). User config is **merged** with defaults — specifying only `"build"` inherits all other fields from the preset.

Note: The canonical `start` command for Next.js is `pnpm start -p ${PORT}` (no `--` separator).

## 9. Config Patching (Iframe + Nav Sync)

VBC patches two things in each worktree before building. All patches are applied to worktree copies only — never to the original project files.

### 9.1 Iframe Headers (next.config)

Patches the Next.js config to add iframe-permissive headers. Detects config format: `next.config.js` (CJS), `next.config.mjs` (ESM), `next.config.ts` (TypeScript).

**Approach:** Use string-based patching (regex), not AST manipulation. Simpler and sufficient for the specific patterns we need:
1. Find the `module.exports` / `export default` block
2. If `headers()` function exists: wrap it to append VBC headers to existing array
3. If no `headers()`: add it to the config object

```javascript
// Injected/merged by VBC into next.config
headers: [
  { key: 'X-Frame-Options', value: 'ALLOWALL' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self' http://localhost:*" }
]
```

Note: `allowedDevOrigins` is not needed — VBC uses build mode (`next start`), not dev mode.

**If patching fails:** Log warning to `.comparator/logs/`, attempt build anyway. If iframe won't load, show screenshot-only fallback with message "Iframe blocked — showing screenshot instead. Check next.config.js headers."

### 9.2 Nav Sync Script

VBC injects a small `<script>` tag into HTML responses for navigation sync.

**Approach for App Router (Next.js 13+):** Inject the script into `app/layout.tsx` (the root layout, equivalent of `_document` in Pages Router). If `app/layout.tsx` exists, append the script to the `<head>` section. If not found, create a minimal one.

**Approach for Pages Router:** Inject into `pages/_document.tsx`. Same wrap-or-create strategy.

**The injected script (~20 lines):**
1. Hooks into `popstate`, `pushState`, `replaceState` events
2. On navigation, sends `postMessage({type: 'vbc-nav', path: '/new-path'})` to parent window
3. Listens for incoming `vbc-nav` messages and navigates accordingly

**Controls:**
- Toggle ON/OFF in UI — when OFF, iframes navigate independently
- Fallback: URL bar in comparator top bar (manual path entry, always works)

## 10. Process Lifecycle

### Startup
1. Detect git repo from `cwd`
2. Cleanup stale state (dead PIDs, orphaned worktrees)
3. Start Next.js app on port 4000
4. Open browser

### Graceful Shutdown (Ctrl+C / SIGTERM)
1. VBC registers `process.on('SIGTERM')` and `process.on('SIGINT')` handlers
2. On signal: stop all branch servers (`SIGTERM`, wait 5s, `SIGKILL`)
3. Close Playwright browser instance
4. Update `state.json` (mark all sources as stopped)
5. Exit cleanly

### Crash Recovery (next startup)
1. Read `state.json` — check each entry's PID with `kill(pid, 0)`
2. Kill any orphaned processes still running
3. Remove orphaned worktrees not in state file
4. Start fresh

## 11. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| RAM pressure (2 servers + VBC) | Sequential builds. Status bar shows memory. Max 2 sources in MVP. |
| Port conflicts | Check port free before bind + retry (max 10) |
| pnpm install slow | Shared pnpm cache. Status bar shows elapsed time. |
| Iframe won't load | Screenshot-only fallback with instructions |
| pixelmatch false positives | Threshold tuning (0.1-0.3) |
| postMessage sync breaks | ON/OFF toggle + URL bar fallback |
| AI hallucinated descriptions | Git diff shown by default; AI is opt-in |
| next.config patch fails | Regex-based (not AST), warn + screenshot fallback |
| Orphaned processes on crash | Startup cleanup scans PIDs and worktrees |
| State file corruption | Rebuild from filesystem |
| Existing layout.tsx in project | Wrap existing content, don't replace |
| Build timeout (large monorepo) | 180s timeout, show last 50 log lines on failure |

## 12. Logging

- **Build logs:** `.comparator/logs/<source-id>.log` — stdout/stderr from build + server processes (rolling, max 1000 lines)
- **VBC logs:** `.comparator/logs/vbc.log` — VBC's own startup, shutdown, errors
- **UI access:** `/api/sources/:id/logs` returns last 100 lines; BuildLog component shows on error
- **Console:** VBC prints key events to terminal (started, branch added, build complete/failed, shutdown)

## 13. NOT in MVP (Future)

| Feature | Phase |
|---------|-------|
| N sources (3+) | V2 |
| Auto-refresh on new commits (WebSocket) | V2 |
| Diff slider (before/after) | V2 |
| Session persistence | V2 |
| Live mode (next dev) | V3 |
| Other framework presets | V3 |
| Flutter support | V3 |
| Component focus | V3 |
| Vercel/cloud integration | V3 |
| Multi-repo | V3 |

## 14. Tech Stack

| Component | Technology |
|-----------|-----------|
| VBC App | Next.js 15 (App Router), TypeScript |
| Git operations | simple-git |
| Process management | child_process.spawn |
| Screenshots | Playwright 1.42+ (optional — iframe preview works without it) |
| Pixel diff | pixelmatch 6.x |
| AI descriptions | Claude API Haiku (requires ANTHROPIC_API_KEY env var) |
| State persistence | JSON file (.comparator/state.json) |
| Package manager | pnpm 9.x |
| Theme | CSS variables (dark/light), localStorage persistence |
