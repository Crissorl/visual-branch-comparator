export interface DiffResult {
  diffImagePath: string;
  diffPercentage: number;
  width: number;
  height: number;
}

export async function compare(imageA: string, imageB: string): Promise<DiffResult> {
  void imageA;
  void imageB;
  throw new Error('Not implemented');
}
