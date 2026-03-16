import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  diffImagePath: string;
  diffPercentage: number;
  changedPixels: number;
  totalPixels: number;
  width: number;
  height: number;
}

export async function compare(
  imageAPath: string,
  imageBPath: string,
  options?: { threshold?: number; outputDir?: string },
): Promise<DiffResult> {
  const threshold = options?.threshold ?? 0.1;
  const outputDir = options?.outputDir ?? join(process.cwd(), '.comparator', 'diffs');

  // Read images
  const imgA = PNG.sync.read(readFileSync(imageAPath));
  const imgB = PNG.sync.read(readFileSync(imageBPath));

  // Handle size mismatch — pad shorter image with white
  const width = Math.max(imgA.width, imgB.width);
  const height = Math.max(imgA.height, imgB.height);

  const padImage = (img: PNG, targetW: number, targetH: number): Buffer => {
    if (img.width === targetW && img.height === targetH) return img.data;
    const padded = Buffer.alloc(targetW * targetH * 4, 255); // white fill
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const srcIdx = (y * img.width + x) * 4;
        const dstIdx = (y * targetW + x) * 4;
        padded[dstIdx] = img.data[srcIdx];
        padded[dstIdx + 1] = img.data[srcIdx + 1];
        padded[dstIdx + 2] = img.data[srcIdx + 2];
        padded[dstIdx + 3] = img.data[srcIdx + 3];
      }
    }
    return padded;
  };

  const dataA = padImage(imgA, width, height);
  const dataB = padImage(imgB, width, height);
  const diff = new PNG({ width, height });

  const changedPixels = pixelmatch(
    dataA as unknown as Uint8Array,
    dataB as unknown as Uint8Array,
    diff.data as unknown as Uint8Array,
    width,
    height,
    { threshold, diffColor: [255, 0, 0] },
  );

  // Write diff image
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const timestamp = Date.now();
  const diffImagePath = join(outputDir, `diff-${timestamp}.png`);
  writeFileSync(diffImagePath, PNG.sync.write(diff));

  const totalPixels = width * height;
  const diffPercentage = totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0;

  return {
    diffImagePath,
    diffPercentage,
    changedPixels,
    totalPixels,
    width,
    height,
  };
}
