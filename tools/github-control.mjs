// Project-scoped release operations. Credentials stay in memory and never enter
// command-line arguments, output files, repository contents or build logs.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';

const repository = 'Tomhao10225101490/TomTrader';
const [method = 'GET', endpoint = '', bodyFile, outputFile] = process.argv.slice(2);
if (!['GET', 'POST', 'PATCH', 'PUT'].includes(method)) throw new Error('Unsupported GitHub operation');
const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
if (remote !== `https://github.com/${repository}.git`) throw new Error('Remote does not match the authorized TomTrader repository');
const credentials = Object.fromEntries(execFileSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
}).trim().split('\n').map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)]; }));
if (!credentials.password) throw new Error('No GitHub credential is available');
let url = `https://api.github.com/repos/${repository}${endpoint}`;
let body;
const headers = { Authorization: `Bearer ${credentials.password}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (endpoint.startsWith('asset-upload:')) {
  const id = endpoint.slice('asset-upload:'.length);
  if (!/^\d+$/.test(id) || !bodyFile) throw new Error('Expected release ID and asset file');
  const { basename } = await import('node:path');
  url = `https://uploads.github.com/repos/${repository}/releases/${id}/assets?name=${encodeURIComponent(basename(bodyFile))}`;
  body = await readFile(bodyFile);
  headers['Content-Type'] = 'application/octet-stream';
  headers['Content-Length'] = String((await stat(bodyFile)).size);
} else {
  if (endpoint && (!endpoint.startsWith('/') || endpoint.includes('://') || endpoint.includes('..'))) throw new Error('Invalid project API path');
  if (bodyFile) { body = await readFile(bodyFile); headers['Content-Type'] = 'application/json'; }
}
const response = await fetch(url, { method, headers, body, redirect: 'follow', signal: AbortSignal.timeout(300_000) });
if (!response.ok) {
  const result = await response.text();
  console.error(`GitHub HTTP ${response.status}: ${result.slice(0, 1200).split(credentials.password).join('[REDACTED]')}`);
  process.exitCode = 1;
} else if (outputFile) await writeFile(outputFile, Buffer.from(await response.arrayBuffer()));
else if (response.status !== 204) console.log(await response.text());
else console.log('GitHub operation accepted (204).');
