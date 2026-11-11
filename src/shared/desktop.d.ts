export {};

declare global {
  interface Window {
    tomtraderDesktop?: {
      status(): Promise<{ version: string; mode: string; configured: boolean; persistent: boolean; secureStorage: boolean; secureStorageChecked: boolean; issue: string | null; polling: string; latency: string }>;
      configure(): Promise<{ ok: boolean }>;
      verify(): Promise<{ ok: boolean; synthetic?: boolean; partial?: boolean; message?: string; checks?: { id: string; ok: boolean; provider: string | null; tier: string; quoteAt: number | null; receivedAt: number | null; issue: string | null }[] }>;
      backup(): Promise<{ ok: boolean; canceled?: boolean }>;
    };
  }
}
