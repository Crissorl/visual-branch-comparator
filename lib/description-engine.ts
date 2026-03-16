import type { DiffResult } from './diff-engine';

export async function describe(gitDiff: string, diffResult: DiffResult | null): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return 'Set ANTHROPIC_API_KEY environment variable to enable AI descriptions.';
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    let prompt = `Analyze these code changes and describe the VISUAL impact on the web application.
Write 3-8 bullet points in plain language that a non-coder can understand.
Focus on what looks different, not technical details.

Git diff:
\`\`\`
${gitDiff.slice(0, 4000)}
\`\`\``;

    if (diffResult) {
      prompt += `\n\nVisual diff stats: ${diffResult.diffPercentage.toFixed(2)}% of pixels changed (${diffResult.changedPixels} out of ${diffResult.totalPixels} pixels).`;
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? 'No description generated.';
  } catch (error) {
    // Fallback to pixel stats
    if (diffResult) {
      return `Visual comparison: ${diffResult.diffPercentage.toFixed(2)}% of pixels changed (${diffResult.changedPixels.toLocaleString()} pixels differ across ${diffResult.width}×${diffResult.height} viewport).`;
    }
    return `AI description unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}
