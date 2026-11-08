import { decodeEntities,parseRss } from '@/server/providers/news';
import { parseFeed,parseStamp,tencentCode } from '@/server/providers/tencent';
import type { Instrument } from '@/server/types';
import { describe,expect,it } from 'vitest';

const hkhs =
  'v_hkHSI="100~恒生指数~HSI~24481.860~24796.980~24404.620~24742770.8160~0~0~24481.860~0~0~0~0~0~0~0~0~0~24481.860~0~0~0~0~0~0~0~0~0~0.0~2026/11/06 18:30:50~-315.120~-1.27~24740.180~24349.300~24481.860~24742770.8160~24742770.816~0~0~~0~0~1.58~0~0~Hang Seng Index~0~28056.100~22518.000~0.88~-24.55~0~0~0~0~0~0.00~0.00~0.00~0~-4.48~5.10~ZS~~~6.01~2.93~-3.77~0.00~0.00~0.00~0.000~~-10.21~HKD~1";';

const hsi: Instrument = {
  id: 'index:HK:^HSI',
  displaySymbol: '^HSI',
  vendorSymbol: '^HSI',
  name: 'Hang Seng Index',
  nameZh: '恒生指数',
  assetType: 'index',
  market: 'HK',
  exchange: 'HKEX',
  currency: 'HKD',
};

describe('tencent feed parser', () => {
  it('extracts keyed rows from a multi-line payload', () => {
    const text = hkhs + 'v_pv_none_match="1";';
    const rows = parseFeed(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('hkHSI');
  });

  it('converts an exchange-local timestamp to the right instant', () => {
    const ts = parseStamp('2026/11/06 18:30:50', hsi);
    expect(ts).not.toBeNull();
    // 18:30:50 HKT = 10:30:50Z, and the contract is epoch seconds.
    expect(new Date((ts ?? 0) * 1000).toISOString()).toBe('2026-11-06T10:30:50.000Z');
    expect(ts).toBeLessThan(2e10);
  });

  it('handles the compact CN timestamp shape', () => {
    const cn: Instrument = { ...hsi, exchange: 'CNE', market: 'CN' };
    const ts = parseStamp('20261106161401', cn);
    expect(new Date((ts ?? 0) * 1000).toISOString()).toBe('2026-11-06T08:14:01.000Z');
  });

  it('survives garbage without inventing a time', () => {
    expect(parseStamp('', hsi)).toBeNull();
    expect(parseStamp('not a date', hsi)).toBeNull();
  });

  it('derives feed codes per market and refuses the ones it cannot name', () => {
    expect(tencentCode({ ...hsi, id: 'equity:US:AAPL', displaySymbol: 'AAPL', market: 'US', exchange: 'XNAS', assetType: 'equity' })).toBe('usAAPL');
    expect(tencentCode({ ...hsi, displaySymbol: 'BRK-B', market: 'US', assetType: 'equity' })).toBe('usBRK.B');
    expect(tencentCode({ ...hsi, displaySymbol: '600519', market: 'CN', exchange: 'CNE', assetType: 'equity' })).toBe('sh600519');
    expect(tencentCode({ ...hsi, displaySymbol: '300750', market: 'CN', exchange: 'XSHE', assetType: 'equity' })).toBe('sz300750');
    expect(tencentCode({ ...hsi, displaySymbol: '00700', market: 'HK', exchange: 'HKEX', assetType: 'equity' })).toBe('hk00700');
    expect(tencentCode({ ...hsi, displaySymbol: '^GSPC', market: 'US', assetType: 'index' })).toBeNull();
  });
});

describe('rss reader', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Fed &amp; markets — statement</title><link><![CDATA[https://example.org/a?x=1&amp;y=2]]></link>
    <pubDate>Fri, 06 Nov 2026 18:00:00 GMT</pubDate><description><![CDATA[Some <b>html</b> here]]></description>
    <category>monetary-policy</category></item>
    <item><title>Second &#8212; entry</title><link>https://example.org/b</link><pubDate>Nonsense</pubDate></item>
  </channel></rss>`;

  it('parses items, CDATA and entities', () => {
    const items = parseRss(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Fed & markets — statement');
    expect(items[0].link).toBe('https://example.org/a?x=1&y=2');
    expect(items[0].category).toBe('monetary-policy');
    expect(Date.parse(items[0].pubDate!)).toBe(Date.parse('2026-11-06T18:00:00Z'));
    expect(items[1].pubDate).toBe('Nonsense');
  });

  it('strips markup out of descriptions rather than rendering it', () => {
    expect(decodeEntities('<p>hello <em>world</em></p>')).toBe('hello world');
    expect(decodeEntities('a&nbsp;b&#39;c&#x2014;d')).toBe("a b'c—d");
  });

  it('returns nothing for an empty or malformed feed instead of throwing', () => {
    expect(parseRss('')).toEqual([]);
    expect(parseRss('<rss><channel></channel></rss>')).toEqual([]);
  });
});
