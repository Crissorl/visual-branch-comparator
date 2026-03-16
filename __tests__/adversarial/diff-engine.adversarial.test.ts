import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PNG } from 'pngjs';

// We need to mock fs to avoid real file I/O, but test the logic
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { compare } from '@/lib/diff-engine';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockExistsSync = vi.mocked(existsSync);

function createTestPNG(
  width: number,
  height: number,
  color: [number, number, number, number] = [255, 0, 0, 255],
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
  return PNG.sync.write(png);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(true);
  mockWriteFileSync.mockImplementation(() => {});
  mockMkdirSync.mockImplementation(() => undefined as unknown as string);
});

describe('diff-engine adversarial tests', () => {
  describe('compare — identical images', () => {
    it('should return 0% diff for identical images', async () => {
      const pngBuf = createTestPNG(10, 10, [128, 128, 128, 255]);
      mockReadFileSync.mockReturnValue(pngBuf);

      const result = await compare('/fake/a.png', '/fake/b.png');
      expect(result.diffPercentage).toBe(0);
      expect(result.changedPixels).toBe(0);
      expect(result.totalPixels).toBe(100);
    });
  });

  describe('compare — completely different images', () => {
    it('should return ~100% diff for opposite images', async () => {
      const whitePng = createTestPNG(10, 10, [255, 255, 255, 255]);
      const blackPng = createTestPNG(10, 10, [0, 0, 0, 255]);
      mockReadFileSync.mockReturnValueOnce(whitePng).mockReturnValueOnce(blackPng);

      const result = await compare('/fake/a.png', '/fake/b.png');
      expect(result.diffPercentage).toBeGreaterThan(90);
      expect(result.changedPixels).toBeGreaterThan(0);
    });
  });

  describe('compare — size mismatch handling', () => {
    it('should handle images of different widths (padding logic)', async () => {
      // BUG HUNT: the padImage function pads with white — does it handle width mismatch correctly?
      const smallPng = createTestPNG(5, 10, [255, 0, 0, 255]);
      const largePng = createTestPNG(10, 10, [255, 0, 0, 255]);
      mockReadFileSync.mockReturnValueOnce(smallPng).mockReturnValueOnce(largePng);

      const result = await compare('/fake/a.png', '/fake/b.png');
      expect(result.width).toBe(10);
      expect(result.height).toBe(10);
      // The padded area (5 pixels wide) will be white vs red = difference
      expect(result.changedPixels).toBeGreaterThan(0);
    });

    it('should handle images of different heights', async () => {
      const shortPng = createTestPNG(10, 5, [0, 255, 0, 255]);
      const tallPng = createTestPNG(10, 10, [0, 255, 0, 255]);
      mockReadFileSync.mockReturnValueOnce(shortPng).mockReturnValueOnce(tallPng);

      const result = await compare('/fake/a.png', '/fake/b.png');
      expect(result.width).toBe(10);
      expect(result.height).toBe(10);
    });

    it('should handle 1x1 pixel images', async () => {
      // BUG HUNT: minimum size edge case
      const tinyPng = createTestPNG(1, 1, [255, 0, 0, 255]);
      mockReadFileSync.mockReturnValue(tinyPng);

      const result = await compare('/fake/a.png', '/fake/b.png');
      expect(result.totalPixels).toBe(1);
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });
  });

  describe('compare — zero-dimension images', () => {
    it('should handle 0-width image gracefully', async () => {
      // BUG HUNT: PNG with 0 width — pngjs may throw or produce empty buffer
      // Creating 0-dimension PNG will likely throw in pngjs itself
      // But what if readFileSync returns a corrupt PNG with 0 dimensions in header?
      const zeroPng = createTestPNG(1, 1); // Can't create 0x0, so we test with corrupt data
      // Modify the PNG buffer to set width=0 in IHDR
      const buf = Buffer.from(zeroPng);
      // IHDR width is at bytes 16-19 in a PNG file
      buf.writeUInt32BE(0, 16);
      mockReadFileSync.mockReturnValue(buf);

      // BUG HUNT: corrupt PNG should throw, not silently produce garbage
      await expect(compare('/fake/a.png', '/fake/b.png')).rejects.toThrow();
    });
  });

  describe('compare — threshold validation', () => {
    it('should accept threshold of 0 (exact match mode)', async () => {
      const pngBuf = createTestPNG(10, 10, [128, 128, 128, 255]);
      mockReadFileSync.mockReturnValue(pngBuf);

      const result = await compare('/fake/a.png', '/fake/b.png', { threshold: 0 });
      expect(result.diffPercentage).toBe(0);
    });

    it('should accept threshold of 1 (maximum tolerance)', async () => {
      const whitePng = createTestPNG(10, 10, [255, 255, 255, 255]);
      const blackPng = createTestPNG(10, 10, [0, 0, 0, 255]);
      mockReadFileSync.mockReturnValueOnce(whitePng).mockReturnValueOnce(blackPng);

      const result = await compare('/fake/a.png', '/fake/b.png', { threshold: 1 });
      // With threshold=1, everything should match
      expect(result.changedPixels).toBe(0);
    });

    it('should not validate negative threshold — passes it to pixelmatch', async () => {
      // BUG HUNT: no input validation on threshold — negative values are passed through
      // BUG FOUND: negative threshold not validated — pixelmatch behavior is undefined
      const pngBuf = createTestPNG(10, 10);
      mockReadFileSync.mockReturnValue(pngBuf);

      // This should ideally throw or clamp, but likely just passes through
      const result = await compare('/fake/a.png', '/fake/b.png', { threshold: -1 });
      expect(typeof result.diffPercentage).toBe('number');
    });

    it('should not validate threshold > 1 — passes it to pixelmatch', async () => {
      // BUG FOUND: threshold > 1 not validated
      const pngBuf = createTestPNG(10, 10);
      mockReadFileSync.mockReturnValue(pngBuf);

      const result = await compare('/fake/a.png', '/fake/b.png', { threshold: 999 });
      expect(typeof result.diffPercentage).toBe('number');
    });

    it('should not validate NaN threshold', async () => {
      // BUG HUNT: NaN threshold — pixelmatch may behave unpredictably
      const pngBuf = createTestPNG(10, 10);
      mockReadFileSync.mockReturnValue(pngBuf);

      const result = await compare('/fake/a.png', '/fake/b.png', { threshold: NaN });
      expect(typeof result.diffPercentage).toBe('number');
    });
  });

  describe('compare — file system errors', () => {
    it('should throw when image file does not exist', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      await expect(compare('/nonexistent/a.png', '/nonexistent/b.png')).rejects.toThrow('ENOENT');
    });

    it('should throw on corrupt (non-PNG) file', async () => {
      // BUG HUNT: what if the file is a JPEG or random binary?
      mockReadFileSync.mockReturnValue(Buffer.from('not a png file'));

      await expect(compare('/fake/a.png', '/fake/b.png')).rejects.toThrow();
    });
  });

  describe('compare — large image memory', () => {
    it('should handle reasonably large images without crashing', async () => {
      // BUG HUNT: padImage creates Buffer.alloc(width * height * 4)
      // For a 4000x3000 image: 48MB buffer. Two images + diff = ~144MB
      // This test verifies the math is correct, not that we have enough memory
      const largePng = createTestPNG(100, 100, [200, 200, 200, 255]);
      mockReadFileSync.mockReturnValue(largePng);

      const result = await compare('/fake/a.png', '/fake/b.png');
      expect(result.totalPixels).toBe(10000);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });
  });

  describe('compare — diff image output', () => {
    it('should create output directory if it does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const pngBuf = createTestPNG(5, 5);
      mockReadFileSync.mockReturnValue(pngBuf);

      await compare('/fake/a.png', '/fake/b.png');
      expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should include timestamp in diff filename for uniqueness', async () => {
      const pngBuf = createTestPNG(5, 5);
      mockReadFileSync.mockReturnValue(pngBuf);

      const result = await compare('/fake/a.png', '/fake/b.png');
      expect(result.diffImagePath).toMatch(/diff-\d+\.png$/);
    });

    it('should write valid PNG data to output', async () => {
      const pngBuf = createTestPNG(5, 5);
      mockReadFileSync.mockReturnValue(pngBuf);

      await compare('/fake/a.png', '/fake/b.png');
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const writtenData = mockWriteFileSync.mock.calls[0][1];
      expect(Buffer.isBuffer(writtenData)).toBe(true);
      // Verify it's a valid PNG by trying to parse it
      const parsed = PNG.sync.read(writtenData as Buffer);
      expect(parsed.width).toBe(5);
      expect(parsed.height).toBe(5);
    });
  });
});
