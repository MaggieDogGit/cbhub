// Absorbed from server/agentCore.ts: retry helpers (withRetry, sleep, parseRetryAfterMs)

function parseRetryAfterMs(errMsg: string): number {
  const secMatch = errMsg.match(/try again in ([\d.]+)s/i);
  if (secMatch) return Math.ceil(parseFloat(secMatch[1]) * 1000) + 2000;
  const msMatch = errMsg.match(/try again in (\d+)ms/i);
  if (msMatch) return parseInt(msMatch[1]) + 2000;
  return 30_000;
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, label = "OpenAI call"): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.message?.includes("429");
      if (!is429 || attempt === maxRetries) throw err;
      const waitMs = parseRetryAfterMs(err.message || "");
      console.log(`[Retry] ${label}: 429 rate limit — waiting ${(waitMs / 1000).toFixed(1)}s before retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitMs);
    }
  }
  throw new Error(`${label}: exceeded max retries`);
}
