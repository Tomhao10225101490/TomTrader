/** Resolves to `fallback` if `promise` has not settled within `ms`. */
export async function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ value: T; timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ value: fallback, timedOut: true }), ms);
  });
  try {
    const value = await Promise.race([promise.then((v) => ({ value: v, timedOut: false as const })), timeout]);
    return value;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Elapsed-time meter used by the search endpoint and the perf benchmarks. */
export function startTimer(): () => number {
  const t0 = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - t0) / 1e6;
}
