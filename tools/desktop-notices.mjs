import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Preserve license texts omitted by Next's runtime-only dependency tracing. */
export async function writeNotices(root, serverDirectory) {
  const notices = ['TomTrader desktop — third-party notices', 'TomTrader itself is MIT licensed; see the accompanying LICENSE.',
    'Electron and Chromium notices are shipped separately with the Electron runtime.'];
  const seen = new Set();
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (item.isDirectory()) await visit(target);
      else if (item.name === 'package.json') {
        const metadata = JSON.parse(await readFile(target, 'utf8'));
        if (!metadata.name || !metadata.version || seen.has(`${metadata.name}@${metadata.version}`)) continue;
        seen.add(`${metadata.name}@${metadata.version}`);
        const original = path.join(root, path.relative(serverDirectory, directory));
        notices.push(`\n${metadata.name}@${metadata.version}\nLicense: ${JSON.stringify(metadata.license ?? 'See package notices')}\nRepository: ${JSON.stringify(metadata.repository ?? '')}`);
        try {
          for (const file of await readdir(original, { withFileTypes: true })) {
            if (file.isFile() && /^(licen[sc]e|copying|notice)(\.|$)/i.test(file.name)) {
              await cp(path.join(original, file.name), path.join(directory, file.name));
              notices.push(await readFile(path.join(original, file.name), 'utf8'));
            }
          }
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    }
  }
  await visit(path.join(serverDirectory, 'node_modules'));
  // Next also contains vendored packages under dist/compiled, which may have
  // no package manifest in the runtime trace. Keep their original notices too.
  const compiled = path.join(root, 'node_modules/next/dist/compiled');
  async function vendored(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await vendored(file);
      else if (/^(licen[sc]e|copying|notice)(\.|$)/i.test(item.name)) {
        notices.push(`\nNext.js vendored dependency: ${path.relative(compiled, file)}\n${await readFile(file, 'utf8')}`);
      }
    }
  }
  await vendored(compiled);
  await writeFile(path.join(serverDirectory, 'THIRD_PARTY_NOTICES.txt'), `${notices.join('\n')}\n`);
}
