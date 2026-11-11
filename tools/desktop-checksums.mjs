import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('release');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const files = (await readdir(directory)).filter((name) => name.startsWith(`TomTrader-${pkg.version}-`) && /\.(dmg|zip|exe)$/.test(name)).sort();
if (!files.length) throw new Error('No desktop installers found in release/');
const lines = [];
const artifacts = [];
const build = JSON.parse(await readFile('desktop-build/server/build-info.json', 'utf8'));
for (const name of files) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(directory, name))) hash.update(chunk);
  const sha256 = hash.digest('hex');
  lines.push(`${sha256}  ${name}`);
  artifacts.push({ filename: name, bytes: (await stat(path.join(directory, name))).size, sha256 });
}
const manifest = `SHA256SUMS-${process.platform}-${process.arch}.txt`;
await writeFile(path.join(directory, manifest), `${lines.join('\n')}\n`);
let installedAcceptance = null;
try { installedAcceptance = JSON.parse(await readFile('test-results/desktop/install.json', 'utf8')); } catch { /* No installed acceptance is not a pass. */ }
let signing = { status: 'unverified' };
if (process.platform === 'darwin') {
  const bundle = path.join(directory, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'TomTrader.app');
  const result = spawnSync('codesign', ['-dv', '--verbose=4', bundle], { encoding: 'utf8' });
  const description = `${result.stdout}${result.stderr}`;
  const integrityVerified = spawnSync('codesign', ['--verify', '--deep', '--strict', bundle]).status === 0;
  if (!integrityVerified) throw new Error('Refusing final manifest: macOS resource signature verification failed');
  signing = { status: result.status !== 0 ? 'unsigned' : /Signature=adhoc/.test(description) ? 'ad-hoc' : 'signed', integrityVerified,
    notarization: spawnSync('xcrun', ['stapler', 'validate', bundle]).status === 0 ? 'staple-validated' : 'not-stapled' };
} else if (process.platform === 'win32') {
  const executable = path.join(directory, artifacts.find((item) => item.filename.endsWith('.exe')).filename).replaceAll("'", "''");
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${executable}').Status.ToString()`], { encoding: 'utf8' });
  signing = { status: result.status === 0 ? result.stdout.trim() : 'unverified' };
}
await writeFile(path.join(directory, `manifest-${process.platform}-${process.arch}.json`), JSON.stringify({
  ...build, artifacts, signing, installedAcceptance,
}, null, 2));
console.log(lines.join('\n'));
