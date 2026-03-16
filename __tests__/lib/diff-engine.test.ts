import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PNG } from 'pngjs';

// Mock fs with writeFileSync included
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  createReadStream: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

// Mock pixelmatch
vi.mock('pixelmatch', () => ({
  default: vi.fn().mockReturnValue(10),
}));

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import pixelmatch from 'pixelmatch';
import { compare } from '@/lib/diff-engine';

const mockedFs = vi.mocked(fs);
const mockedFsp = vi.mocked(fsp);
const mockedPixelmatch = vi.mocked(pixelmatch);

function createTestPNG(
  width: number,
  height: number,
  color: [number, number, number, number] = [255, 0, 0, 255],
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
  return PNG.sync.write(png);
}

describe('diff-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.mkdirSync.mockReturnValue(undefined);
    mockedFs.writeFileSync.mockReturnValue(undefined);
  });

  describe('compare', () => {
    it('should return a DiffResult with all required fields', async () => {
      const imgA = createTestPNG(100, 100, [255, 0, 0, 255]);
      const imgB = createTestPNG(100, 100, [0, 255, 0, 255]);

      mockedFs.readFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.png')) return imgA;
        if (p.includes('b.png')) return imgB;
        return imgA;
      });
      mockedFsp.readFile.mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('a.png')) return imgA;
        if (p.includes('b.png')) return imgB;
        return imgA;
      });

      mockedPixelmatch.mockReturnValue(500);

      const result = await compare('/tmp/a.png', '/tmp/b.png');

      expect(result).toHaveProperty('diffImagePath');
      expect(result).toHaveProperty('diffPercentage');
      expect(result).toHaveProperty('changedPixels');
      expect(result).toHaveProperty('totalPixels');
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
      expect(typeof result.diffPercentage).toBe('number');
      expect(typeof result.changedPixels).toBe('number');
    });

    it('should calculate diffPercentage as (changedPixels / totalPixels) * 100', async () => {
      const imgA = createTestPNG(10, 10, [255, 0, 0, 255]);
      const imgB = createTestPNG(10, 10, [0, 255, 0, 255]);

      mockedFs.readFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.png')) return imgA;
        return imgB;
      });
      mockedFsp.readFile.mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('a.png')) return imgA;
        return imgB;
      });

      mockedPixelmatch.mockReturnValue(25);

      const result = await compare('/tmp/a.png', '/tmp/b.png');

      expect(result.totalPixels).toBe(100);
      expect(result.changedPixels).toBe(25);
      expect(result.diffPercentage).toBe(25);
      expect(result.width).toBe(10);
      expect(result.height).toBe(10);
    });

    it('should write diff image to a path ending in .png', async () => {
      const img = createTestPNG(10, 10);

      mockedFs.readFileSync.mockReturnValue(img);
      mockedFsp.readFile.mockResolvedValue(img);
      mockedPixelmatch.mockReturnValue(0);

      const result = await compare('/tmp/a.png', '/tmp/b.png');

      expect(result.diffImagePath).toMatch(/\.png$/);
    });

    it('should return 0 diffPercentage for identical images', async () => {
      const img = createTestPNG(10, 10, [128, 128, 128, 255]);

      mockedFs.readFileSync.mockReturnValue(img);
      mockedFsp.readFile.mockResolvedValue(img);
      mockedPixelmatch.mockReturnValue(0);

      const result = await compare('/tmp/a.png', '/tmp/b.png');

      expect(result.changedPixels).toBe(0);
      expect(result.diffPercentage).toBe(0);
    });

    it('should pass threshold option to pixelmatch', async () => {
      const img = createTestPNG(10, 10);

      mockedFs.readFileSync.mockReturnValue(img);
      mockedFsp.readFile.mockResolvedValue(img);
      mockedPixelmatch.mockReturnValue(0);

      await compare('/tmp/a.png', '/tmp/b.png', { threshold: 0.5 });

      expect(mockedPixelmatch).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        10,
        10,
        expect.objectContaining({ threshold: 0.5 }),
      );
    });

    it('should use default threshold of 0.1 when not specified', async () => {
      const img = createTestPNG(10, 10);

      mockedFs.readFileSync.mockReturnValue(img);
      mockedFsp.readFile.mockResolvedValue(img);
      mockedPixelmatch.mockReturnValue(0);

      await compare('/tmp/a.png', '/tmp/b.png');

      expect(mockedPixelmatch).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        10,
        10,
        expect.objectContaining({ threshold: 0.1 }),
      );
    });

    // ASSUMPTION: size mismatch pads shorter image with white to match larger dimensions
    it('should handle images of different sizes', async () => {
      const imgA = createTestPNG(10, 10);
      const imgB = createTestPNG(20, 15);

      mockedFs.readFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('a.png')) return imgA;
        return imgB;
      });
      mockedFsp.readFile.mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('a.png')) return imgA;
        return imgB;
      });
      mockedPixelmatch.mockReturnValue(50);

      const result = await compare('/tmp/a.png', '/tmp/b.png');

      // After padding, dimensions should match the larger image
      expect(result.width).toBe(20);
      expect(result.height).toBe(15);
      expect(result.totalPixels).toBe(300);
    });
  });
});
