'use client';
import { Block } from '@/components/Page';
import { Button } from '@/components/ui';
import { useI18n } from '@/lib/i18n-context';
import { useEffect, useState } from 'react';

type DesktopStatus = Awaited<ReturnType<NonNullable<Window['tomtraderDesktop']>['status']>>;
type Verification = Awaited<ReturnType<NonNullable<Window['tomtraderDesktop']>['verify']>>;

export function DesktopDataSettings() {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { void window.tomtraderDesktop?.status().then(setStatus); }, []);
  if (!status) return null;
  return <Block title={zh ? '桌面行情配置' : 'Desktop data sources'}>
    <div className="space-y-3 p-3 text-[12px] text-ink-secondary">
      <p data-testid="desktop-data-mode"><strong>{status.mode === 'demo' ? (zh ? 'Demo · 模拟数据' : 'Demo · synthetic data') : status.mode === 'official' ? 'Finnhub · US quotes only' : (zh ? '公开行情 · 真实数据请求' : 'Public feeds · real source requests')}</strong></p>
      <p>{zh ? '延迟未经核实。连接状态表示本地传输，不代表交易所实时授权。历史图表按各数据源实际可用能力提供，失败不会回退到模拟数据。' : 'Latency unverified. Connected describes local transport, not exchange-grade real-time entitlement. Charts depend on provider capabilities; failures never fall back to synthetic data.'}</p>
      <p>Finnhub: {status.configured ? (zh ? '已配置个人 Key' : 'Personal key configured') : (zh ? '未配置（可选）' : 'Not configured (optional)')} · {status.secureStorage ? (zh ? '系统安全存储可用' : 'System secure storage available') : (zh ? '仅本次会话，不保存明文' : 'Session only; plaintext persistence forbidden')}</p>
      {status.issue ? <p role="alert">{status.issue}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { void window.tomtraderDesktop?.configure(); }}>{zh ? '配置数据源 / Key' : 'Configure sources / Key'}</Button>
        <Button disabled={busy} onClick={async () => {
          setBusy(true);
          try { setVerification(await window.tomtraderDesktop!.verify()); }
          catch { setMessage(zh ? '验证失败，可稍后重试。' : 'Verification failed. Retry when connectivity returns.'); }
          finally { setBusy(false); }
        }}>{busy ? (zh ? '验证中…' : 'Checking…') : (zh ? '验证连接' : 'Verify connection')}</Button>
        <Button onClick={async () => {
          try { const result = await window.tomtraderDesktop!.backup(); if (!result.canceled) setMessage(result.ok ? (zh ? '数据库备份已保存。' : 'Database backup saved.') : 'Backup failed.'); }
          catch { setMessage(zh ? '备份失败，原始数据未更改。' : 'Backup failed. Original data unchanged.'); }
        }}>{zh ? '备份本地数据…' : 'Back up local data…'}</Button>
      </div>
      <div role="status" className="space-y-1 text-[11px]">
        {message ? <p>{message}</p> : null}
        {verification ? <>
          <p>{verification.synthetic ? (zh ? '仅验证 Demo，未调用真实数据源。' : 'Demo only; no real data source contacted.') : verification.ok ? (verification.partial ? (zh ? '部分数据源可用。' : 'Some sources available.') : (zh ? '真实行情请求已返回。' : 'Real source requests returned.')) : (zh ? '真实行情暂不可用，没有切换为 Demo。' : 'Real sources unavailable. Not switched to Demo.')}</p>
          {verification.checks?.map((check) => <p key={check.id} className="num">{check.id} · {check.provider ?? check.issue} · {check.tier} · quote {check.quoteAt ? new Date(check.quoteAt * 1000).toISOString() : '—'} · received {check.receivedAt ? new Date(check.receivedAt).toISOString() : '—'}</p>)}
        </> : null}
      </div>
      <p className="text-ink-faint">TomTrader {status.version} · {status.polling}</p>
    </div>
  </Block>;
}
