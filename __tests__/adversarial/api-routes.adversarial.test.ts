import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before imports
vi.mock('@/lib/state-store', () => ({
  readState: vi.fn(),
}));

vi.mock('@/lib/screenshot-engine', () => ({
  capture: vi.fn(),
}));

vi.mock('@/lib/diff-engine', () => ({
  compare: vi.fn(),
}));

vi.mock('@/lib/git-diff', () => ({
  getGitDiff: vi.fn(),
}));

vi.mock('@/lib/description-engine', () => ({
  describe: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock NextRequest and NextResponse
class MockNextRequest {
  private body: unknown;
  constructor(body: unknown) {
    this.body = body;
  }
  async json(): Promise<unknown> {
    if (this.body === 'INVALID_JSON') {
      throw new SyntaxError('Unexpected token');
    }
    return this.body;
  }
}

vi.mock('next/server', () => ({
  NextRequest: MockNextRequest,
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      data,
      status: init?.status ?? 200,
      async json() {
        return data;
      },
    }),
  },
}));

import { readState } from '@/lib/state-store';
import { capture } from '@/lib/screenshot-engine';
import { compare } from '@/lib/diff-engine';
import { getGitDiff } from '@/lib/git-diff';
import { describe as describeEngine } from '@/lib/description-engine';
import { readFileSync } from 'node:fs';

const mockReadState = vi.mocked(readState);
const mockCapture = vi.mocked(capture);
const mockCompare = vi.mocked(compare);
const mockGetGitDiff = vi.mocked(getGitDiff);
const mockDescribe = vi.mocked(describeEngine);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to create a mock state with running sources
function mockRunningState(): Record<string, unknown> {
  return {
    src_aaa: {
      id: 'src_aaa',
      branch: 'main',
      worktreePath: '/tmp/wt-main',
      port: 3001,
      status: 'running',
    },
    src_bbb: {
      id: 'src_bbb',
      branch: 'dev',
      worktreePath: '/tmp/wt-dev',
      port: 3002,
      status: 'running',
    },
  };
}

describe('API route: /api/diff — adversarial tests', () => {
  // We import the route handler dynamically to avoid module resolution issues
  let POST: (
    request: unknown,
  ) => Promise<{ data: unknown; status: number; json(): Promise<unknown> }>;

  beforeEach(async () => {
    const mod = await import('@/app/api/diff/route');
    POST = mod.POST as typeof POST;
  });

  it('should reject null body', async () => {
    const req = new MockNextRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should reject array body', async () => {
    const req = new MockNextRequest([1, 2, 3]);
    // Arrays pass typeof === 'object' and !== null, but fail the specific field checks
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should reject missing sourceAId', async () => {
    const req = new MockNextRequest({ sourceBId: 'src_bbb' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should reject missing sourceBId', async () => {
    const req = new MockNextRequest({ sourceAId: 'src_aaa' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should reject numeric sourceAId (type coercion trap)', async () => {
    // BUG HUNT: what if sourceAId is a number instead of string?
    const req = new MockNextRequest({ sourceAId: 123, sourceBId: 'src_bbb' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should reject empty string sourceAId', async () => {
    // BUG HUNT: empty string passes typeof === 'string' check
    // BUG FOUND: empty string is accepted — will just not find the source (404)
    mockReadState.mockResolvedValue({});
    const req = new MockNextRequest({ sourceAId: '', sourceBId: '' });
    const res = await POST(req);
    // Empty strings pass validation, then source lookup fails with 404
    expect(res.status).toBe(404);
  });

  it('should return 404 when source ID does not exist', async () => {
    mockReadState.mockResolvedValue({});
    const req = new MockNextRequest({ sourceAId: 'src_xxx', sourceBId: 'src_yyy' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('should return 400 when sources are not running', async () => {
    mockReadState.mockResolvedValue({
      src_aaa: {
        id: 'src_aaa',
        branch: 'main',
        port: 3001,
        status: 'stopped',
        worktreePath: '/tmp',
      },
      src_bbb: {
        id: 'src_bbb',
        branch: 'dev',
        port: 3002,
        status: 'building',
        worktreePath: '/tmp',
      },
    });
    const req = new MockNextRequest({ sourceAId: 'src_aaa', sourceBId: 'src_bbb' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('running');
  });

  it('should return 500 when screenshot capture fails', async () => {
    mockReadState.mockResolvedValue(mockRunningState());
    mockCapture.mockRejectedValue(new Error('Browser crashed'));

    const req = new MockNextRequest({ sourceAId: 'src_aaa', sourceBId: 'src_bbb' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Browser crashed');
  });

  it('should handle threshold as a non-number string (ignored safely)', async () => {
    // BUG HUNT: threshold="abc" — typeof !== 'number' so falls back to undefined
    mockReadState.mockResolvedValue(mockRunningState());
    mockCapture.mockResolvedValue('/fake/screenshot.png');
    mockCompare.mockResolvedValue({
      diffImagePath: '/fake/diff.png',
      diffPercentage: 0,
      changedPixels: 0,
      totalPixels: 100,
      width: 10,
      height: 10,
    });
    mockReadFileSync.mockReturnValue(Buffer.from('PNG'));

    const req = new MockNextRequest({
      sourceAId: 'src_aaa',
      sourceBId: 'src_bbb',
      threshold: 'not_a_number',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // threshold falls back to undefined (default 0.1 in diff-engine)
    expect(mockCompare).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      threshold: undefined,
    });
  });

  it('should handle NaN threshold (passes typeof number check!)', async () => {
    // BUG FOUND: NaN passes typeof === 'number' check — gets forwarded to pixelmatch
    mockReadState.mockResolvedValue(mockRunningState());
    mockCapture.mockResolvedValue('/fake/screenshot.png');
    mockCompare.mockResolvedValue({
      diffImagePath: '/fake/diff.png',
      diffPercentage: 0,
      changedPixels: 0,
      totalPixels: 100,
      width: 10,
      height: 10,
    });
    mockReadFileSync.mockReturnValue(Buffer.from('PNG'));

    const req = new MockNextRequest({
      sourceAId: 'src_aaa',
      sourceBId: 'src_bbb',
      threshold: NaN,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // NaN passes typeof === 'number' and gets passed to compare
    expect(mockCompare).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      threshold: NaN,
    });
  });

  it('should return base64 encoded diff image on success', async () => {
    mockReadState.mockResolvedValue(mockRunningState());
    mockCapture.mockResolvedValue('/fake/screenshot.png');
    mockCompare.mockResolvedValue({
      diffImagePath: '/fake/diff.png',
      diffPercentage: 5.5,
      changedPixels: 550,
      totalPixels: 10000,
      width: 100,
      height: 100,
    });
    mockReadFileSync.mockReturnValue(Buffer.from('fake-png-data'));

    const req = new MockNextRequest({ sourceAId: 'src_aaa', sourceBId: 'src_bbb' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.diffImageBase64).toMatch(/^data:image\/png;base64,/);
    expect(json.diffPercentage).toBe(5.5);
    expect(json.changedPixels).toBe(550);
  });

  it('should handle invalid JSON body', async () => {
    const req = new MockNextRequest('INVALID_JSON');
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('should use Object.values for source lookup — O(n) scan on every request', async () => {
    // BUG FOUND (MEDIUM): source lookup uses Object.values().find() instead of direct key access
    // state[sourceAId] would be O(1) but the code does O(n) scan
    // This also means sourceAId is matched against source.id, not the state key
    // If the key differs from source.id, behavior is unexpected
    const weirdState: Record<string, unknown> = {
      weird_key: {
        id: 'src_aaa',
        branch: 'main',
        port: 3001,
        status: 'running',
        worktreePath: '/tmp',
      },
    };
    mockReadState.mockResolvedValue(weirdState);
    mockCapture.mockResolvedValue('/fake/screenshot.png');
    mockCompare.mockResolvedValue({
      diffImagePath: '/fake/diff.png',
      diffPercentage: 0,
      changedPixels: 0,
      totalPixels: 100,
      width: 10,
      height: 10,
    });
    mockReadFileSync.mockReturnValue(Buffer.from('PNG'));

    // sourceAId = 'src_aaa' matches source.id even though key is 'weird_key'
    const req = new MockNextRequest({ sourceAId: 'src_aaa', sourceBId: 'src_aaa' });
    const res = await POST(req);
    // This works because find() checks s.id, not the key
    expect(res.status).toBe(200);
  });
});

describe('API route: /api/describe — adversarial tests', () => {
  let POST: (
    request: unknown,
  ) => Promise<{ data: unknown; status: number; json(): Promise<unknown> }>;

  beforeEach(async () => {
    const mod = await import('@/app/api/describe/route');
    POST = mod.POST as typeof POST;
  });

  it('should reject body without sourceAId or sourceBId', async () => {
    const req = new MockNextRequest({ foo: 'bar' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should reject non-string source IDs', async () => {
    const req = new MockNextRequest({ sourceAId: 123, sourceBId: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should return 404 for nonexistent sources', async () => {
    mockReadState.mockResolvedValue({});
    const req = new MockNextRequest({ sourceAId: 'nope', sourceBId: 'nada' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('should not check if sources are running before getting diff', async () => {
    // BUG FOUND (MEDIUM): /api/describe does NOT check source.status === 'running'
    // Unlike /api/diff which requires running, describe allows stopped/error sources
    // This means you can describe diffs for sources that may have stale/broken state
    mockReadState.mockResolvedValue({
      src_a: { id: 'src_a', branch: 'main', port: 3001, status: 'error', worktreePath: '/tmp' },
      src_b: { id: 'src_b', branch: 'dev', port: 3002, status: 'stopped', worktreePath: '/tmp' },
    });
    mockGetGitDiff.mockReturnValue('some diff');
    mockDescribe.mockResolvedValue('Description');

    const req = new MockNextRequest({ sourceAId: 'src_a', sourceBId: 'src_b' });
    const res = await POST(req);
    // This succeeds even though sources are not running
    expect(res.status).toBe(200);
  });

  it('should pass null as diffResult to describe engine', async () => {
    // The describe route always passes null for diffResult — no pixel stats
    mockReadState.mockResolvedValue(mockRunningState());
    mockGetGitDiff.mockReturnValue('diff');
    mockDescribe.mockResolvedValue('Description text');

    const req = new MockNextRequest({ sourceAId: 'src_aaa', sourceBId: 'src_bbb' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockDescribe).toHaveBeenCalledWith('diff', null);
  });

  it('should handle git diff failure gracefully', async () => {
    mockReadState.mockResolvedValue(mockRunningState());
    mockGetGitDiff.mockReturnValue('Failed to get diff: fatal error');
    mockDescribe.mockResolvedValue('Could not analyze');

    const req = new MockNextRequest({ sourceAId: 'src_aaa', sourceBId: 'src_bbb' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gitDiff).toContain('Failed to get diff');
  });

  it('should handle describe engine throwing', async () => {
    mockReadState.mockResolvedValue(mockRunningState());
    mockGetGitDiff.mockReturnValue('diff');
    mockDescribe.mockRejectedValue(new Error('API rate limit'));

    const req = new MockNextRequest({ sourceAId: 'src_aaa', sourceBId: 'src_bbb' });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('should accept body with extra fields (no strict validation)', async () => {
    // BUG HUNT: extra fields like __proto__ in body
    mockReadState.mockResolvedValue(mockRunningState());
    mockGetGitDiff.mockReturnValue('diff');
    mockDescribe.mockResolvedValue('desc');

    const req = new MockNextRequest({
      sourceAId: 'src_aaa',
      sourceBId: 'src_bbb',
      extraField: 'should be ignored',
      __proto__: { isAdmin: true },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe('API route: /api/screenshots — adversarial tests', () => {
  let POST: (
    request: unknown,
  ) => Promise<{ data: unknown; status: number; json(): Promise<unknown> }>;

  beforeEach(async () => {
    const mod = await import('@/app/api/screenshots/route');
    POST = mod.POST as typeof POST;
  });

  it('should reject body without sourceId', async () => {
    const req = new MockNextRequest({ notSourceId: 'abc' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should reject empty string sourceId', async () => {
    const req = new MockNextRequest({ sourceId: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('non-empty');
  });

  it('should reject whitespace-only sourceId', async () => {
    const req = new MockNextRequest({ sourceId: '   ' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should reject numeric sourceId', async () => {
    const req = new MockNextRequest({ sourceId: 42 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should return 404 for nonexistent source', async () => {
    mockReadState.mockResolvedValue({});
    const req = new MockNextRequest({ sourceId: 'src_nonexistent' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('should return 400 for non-running source', async () => {
    mockReadState.mockResolvedValue({
      src_a: { id: 'src_a', branch: 'main', port: 3001, status: 'building', worktreePath: '/tmp' },
    });
    const req = new MockNextRequest({ sourceId: 'src_a' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('not running');
  });

  it('should handle path traversal in sourceId (used in filename)', async () => {
    // BUG FOUND (HIGH): sourceId is used directly in file path construction
    // `${sourceId}-${timestamp}.png` — if sourceId contains '../' it's path traversal
    // path.join resolves '../' so the traversal DOES happen — the file escapes the screenshots dir
    mockReadState.mockResolvedValue({
      '../../../etc/pwned': {
        id: '../../../etc/pwned',
        branch: 'main',
        port: 3001,
        status: 'running',
        worktreePath: '/tmp',
      },
    });
    mockCapture.mockResolvedValue('/tmp/screenshot.png');

    const req = new MockNextRequest({ sourceId: '../../../etc/pwned' });
    const res = await POST(req);
    // The source is found and is running — screenshot is taken
    expect(res.status).toBe(200);
    // path.join resolves '../' — the file lands OUTSIDE the screenshots directory
    const outputPath = mockCapture.mock.calls[0][1] as string;
    // BUG: the output path does NOT contain 'screenshots' — it escaped the directory
    expect(outputPath).not.toContain('.comparator/screenshots');
    // It resolves to something like /cwd/etc/pwned-timestamp.png
    expect(outputPath).toContain('etc/pwned');
  });

  it('should return screenshot path and timestamp on success', async () => {
    mockReadState.mockResolvedValue({
      src_a: { id: 'src_a', branch: 'main', port: 3001, status: 'running', worktreePath: '/tmp' },
    });
    mockCapture.mockResolvedValue('/fake/screenshots/src_a-123.png');

    const req = new MockNextRequest({ sourceId: 'src_a' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toContain('src_a');
    expect(typeof json.timestamp).toBe('number');
  });

  it('should return 500 when capture throws', async () => {
    mockReadState.mockResolvedValue({
      src_a: { id: 'src_a', branch: 'main', port: 3001, status: 'running', worktreePath: '/tmp' },
    });
    mockCapture.mockRejectedValue(new Error('Timeout waiting for page'));

    const req = new MockNextRequest({ sourceId: 'src_a' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Timeout');
  });

  it('should expose internal file path in response (information leak)', async () => {
    // BUG FOUND (LOW): response includes full server-side file path
    // This leaks internal directory structure to the client
    mockReadState.mockResolvedValue({
      src_a: { id: 'src_a', branch: 'main', port: 3001, status: 'running', worktreePath: '/tmp' },
    });
    const internalPath = '/Users/secret-user/projects/app/.comparator/screenshots/src_a-123.png';
    mockCapture.mockResolvedValue(internalPath);

    const req = new MockNextRequest({ sourceId: 'src_a' });
    const res = await POST(req);
    const json = await res.json();
    // Full internal path is exposed to client
    expect(json.path).toContain('/Users/secret-user');
  });
});
