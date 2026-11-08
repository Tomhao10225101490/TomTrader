import { fetchJson } from '../src/server/http';
async function main() {
  const r = await fetchJson<any>('https://np-weblist.eastmoney.com/comm/web/getFastNewsList', {
    query: { client: 'web', biz: 'web_724', fastColumn: '102', pageSize: 5, sortEnd: '', req_trace: String(Date.now()) },
    headers: { Referer: 'https://finance.eastmoney.com/' },
  });
  console.log('ok?', r.ok);
  if (r.ok) {
    console.log('top keys', Object.keys(r.data));
    console.log('code', r.data.code, 'message', r.data.message);
    console.log('data keys', r.data.data ? Object.keys(r.data.data) : 'no data');
    const list = r.data.data?.fastNewsList;
    console.log('list length', Array.isArray(list) ? list.length : typeof list);
    console.log(JSON.stringify(r.data).slice(0, 400));
  } else console.log(JSON.stringify(r.error));
}
await main();
