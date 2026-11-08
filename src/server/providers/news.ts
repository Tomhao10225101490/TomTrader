import { fetchJson,raw } from '../http';
import type { CapabilityResult,NewsItem } from '../types';
import { err,ok } from '../types';
import { publicFeedsEnabled } from './access';

/**
 * Market news.
 *
 * Licensing is the reason this file looks the way it does.
 *
 *  - Google News RSS was tested and rejected: its own `<copyright>` block
 *    states the feed is "made available solely for the purpose of rendering
 *    Google News results within a personal feed reader for personal,
 *    non-commercial use. Any other use of the feed is expressly prohibited."
 *    Embedding it in a product would breach that, so it is not used.
 *  - The Federal Reserve press-release feed is a US Government work,
 *    redistribute-friendly, and is the most authoritative "market event"
 *    source available without a key.
 *  - Eastmoney's 7×24 wire is the same public web endpoint the rest of the
 *    China coverage uses. Headlines are Chinese; the item keeps its source
 *    label and a link to the original article, and TomTrader stores nothing
 *    beyond the headline metadata for display.
 *  - Per-symbol news comes from Yahoo's public search endpoint when the feed
 *    is reachable, tagged with its publisher and original URL.
 *
 * Nothing here is rewritten, summarised or invented. If a source returns
 * nothing, the UI says so.
 */

const EM_WIRE = 'https://np-weblist.eastmoney.com/comm/web/getFastNewsList';
const EM_COLUMN = 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumns';
const FED_RSS = 'https://www.federalreserve.gov/feeds/press_all.xml';
/** Column 350 is Eastmoney's global finance column; 102 is the 7×24 wire. */
const EM_GLOBAL_COLUMN = '350';

interface EmWireItem {
  code?: string;
  title?: string;
  summary?: string;
  showTime?: string;
  uniqueUrl?: string;
  /**
   * Codes the editor attached to the item. The wire sends a comma-separated
   * string, the column feed sends an array of objects — both shapes occur, so
   * neither is assumed.
   */
  stockList?: string | { code?: string; name?: string }[];
}

export async function getMarketWire(limit = 30): Promise<CapabilityResult<NewsItem[]>> {
  if (!publicFeedsEnabled()) return err('unsupported', 'Public news adapter disabled; data rights not confirmed.');
  const res = await fetchJson<{ data?: { fastNewsList?: EmWireItem[] } }>(EM_WIRE, {
    query: {
      client: 'web',
      biz: 'web_724',
      fastColumn: '102',
      pageSize: Math.min(limit, 50),
      sortEnd: '',
      req_trace: String(Date.now()),
    },
    retries: 2,
    timeoutMs: 10_000,
    headers: { Referer: 'https://finance.eastmoney.com/' },
  });
  if (!res.ok) return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);
  const items = (res.data.data?.fastNewsList ?? []).map((n) => emItem(n, 'Eastmoney 7×24 wire'));
  return ok(items);
}

export async function getGlobalFinanceNews(limit = 20): Promise<CapabilityResult<NewsItem[]>> {
  if (!publicFeedsEnabled()) return err('unsupported', 'Public news adapter disabled; data rights not confirmed.');
  const res = await fetchJson<{ data?: { list?: EmWireItem[] } }>(EM_COLUMN, {
    query: {
      client: 'web',
      biz: 'web_news_col',
      column: EM_GLOBAL_COLUMN,
      order: 1,
      needInteractData: 0,
      page_index: 1,
      page_size: Math.min(limit, 30),
      req_trace: String(Date.now()),
    },
    retries: 2,
    timeoutMs: 10_000,
    headers: { Referer: 'https://finance.eastmoney.com/' },
  });
  if (!res.ok) return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);
  return ok((res.data.data?.list ?? []).map((n) => emItem(n, 'Eastmoney finance')));
}

function symbolList(value: EmWireItem['stockList']): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : (v.code ?? v.name ?? ''))).filter(Boolean).slice(0, 8);
  }
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function emItem(n: EmWireItem, publisher: string): NewsItem {
  const stamp = n.showTime ? Date.parse(n.showTime.replace(' ', 'T') + '+08:00') : NaN;
  return {
    id: `em:${n.code ?? n.showTime ?? Math.random().toString(36)}`,
    title: decodeEntities((n.title ?? n.summary ?? '').trim()),
    publisher,
    publishedAt: stamp,
    url: n.uniqueUrl ? n.uniqueUrl.replace(/^http:/, 'https:') : 'https://finance.eastmoney.com/',
    symbols: symbolList(n.stockList),
    category: 'wire',
    thumbnail: null,
    provider: 'eastmoney',
  };
}

export async function getPolicyNews(): Promise<CapabilityResult<NewsItem[]>> {
  const res = await raw(FED_RSS, { retries: 2, timeoutMs: 12_000 });
  if (!res.ok) return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);
  const items = parseRss(res.res.body).map((r) => ({
    id: `fed:${r.link ?? r.title}`,
    title: decodeEntities(r.title ?? '').replace(/^Federal Reserve Board\s*-\s*/i, ''),
    publisher: 'Federal Reserve Board',
    publishedAt: r.pubDate ? Date.parse(r.pubDate) : NaN,
    link: r.link ?? 'https://www.federalreserve.gov/newsevents.htm',
    category: r.category ?? 'policy',
    description: r.description,
  }));
  return ok(
    items.filter((i) => i.title && Number.isFinite(i.publishedAt) && /^https:\/\//.test(i.link)).map((i) => ({
      id: i.id,
      title: i.title,
      publisher: i.publisher,
      publishedAt: i.publishedAt,
      url: i.link,
      symbols: [],
      category: i.category,
      thumbnail: null,
      provider: 'calendar' as const,
    })),
  );
}

/* -------------------------------------------------------------------- rss */

export interface RssItem {
  title: string | null;
  link: string | null;
  pubDate: string | null;
  description: string | null;
  category: string | null;
}

/**
 * Deliberately small RSS reader: these feeds are flat item lists, so a full
 * XML parser would be more surface area than the job needs. Anything outside
 * `<item>` is ignored, CDATA is unwrapped, entities decoded.
 */
export function parseRss(xml: string): RssItem[] {
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  return blocks.map((block) => {
    const chunk = block.split(/<\/item>/i)[0];
    const field = (name: string) => {
      const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(chunk);
      if (!m) return null;
      const raw = m[1].trim();
      const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
      return decodeEntities(cdata ? cdata[1].trim() : raw);
    };
    return {
      title: field('title'),
      link: field('link'),
      pubDate: field('pubDate'),
      description: field('description'),
      category: field('category'),
    };
  });
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
};

export function decodeEntities(input: string): string {
  let out = input;
  for (const [entity, ch] of Object.entries(ENTITIES)) out = out.split(entity).join(ch);
  out = out.replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)));
  out = out.replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)));
  // Strip tags that some feeds leave inside titles.
  return out.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
