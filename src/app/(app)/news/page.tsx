'use client';
import { Picker } from '@/app/(app)/watchlist/page';
import { NewsList } from '@/components/NewsList';
import { Block,Page } from '@/components/Page';
import { Button } from '@/components/ui';
import { useI18n } from '@/lib/i18n-context';
import { useState } from 'react';

/**
 * Market news. Headlines come from two sources TomTrader is allowed to show:
 * Eastmoney's public 7×24 wire and the Federal Reserve's own press-release
 * feed. The page links to the original article and names the publisher for
 * every row — TomTrader does not rewrite or summarise a headline.
 */
export default function NewsPage() {
  const { t, locale } = useI18n();
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  return (
    <Page
      title={t('news.title')}
      subtitle={t('news.disclaimer')}
      actions={
        <>
          <Button size="sm" onClick={() => setInstrumentId(null)} disabled={!instrumentId}>
            {t('news.filterAll')}
          </Button>
          <Button size="sm" onClick={() => setPickOpen(true)}>
            {instrumentId ? (locale === 'zh' ? '更换证券' : 'Change symbol') : (locale === 'zh' ? '按证券筛选' : 'By symbol')}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setNonce((n) => n + 1)}>
            {t('common.retry')}
          </Button>
        </>
      }
    >
      {instrumentId ? (
        <p className="text-[11.5px] text-ink-muted">
          {t('news.related')}: <span className="num text-ink">{instrumentId}</span> · {locale === 'zh' ? '仅显示与该证券相关的头条' : 'headlines mentioning this instrument'}
        </p>
      ) : null}
      <Block flush>
        <NewsList key={`${instrumentId ?? 'all'}:${nonce}`} instrumentId={instrumentId} limit={40} />
      </Block>
      <Picker open={pickOpen} onClose={() => setPickOpen(false)} onPick={(id) => { setInstrumentId(id); setPickOpen(false); }} />
    </Page>
  );
}
