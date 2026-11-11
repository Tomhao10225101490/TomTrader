import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { writeNotices } from './desktop-notices.mjs';

const root = process.cwd();
const source = path.join(root, '.next/standalone');
const destination = path.join(root, 'desktop-build/server');
await readFile(path.join(source, 'server.js')); // Fail before deleting staging if build is missing.
await rm(path.join(root, 'desktop-build'), { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  dereference: true,
  // Next tracing may include local environment files. Never distribute secrets,
  // developer databases, build caches, or provider credentials.
  filter: (file) => !path.relative(source, file).split(path.sep).some((part) =>
    part.startsWith('.env') || ['data', '.git', 'cache'].includes(part)),
});
await cp(path.join(root, '.next/static'), path.join(destination, '.next/static'), { recursive: true });
await cp(path.join(root, 'public'), path.join(destination, 'public'), { recursive: true });

async function assertClean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.env') || /\.(db|sqlite)(-wal|-shm)?$/.test(entry.name)) {
      throw new Error(`Private runtime file in desktop bundle: ${entry.name}`);
    }
    if (entry.isDirectory()) await assertClean(path.join(directory, entry.name));
  }
}
await writeNotices(root, destination);
await assertClean(destination);
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const buildInfo = {
  version, platform: process.platform, arch: process.arch,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  buildTask: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local',
  electron: JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version,
  next: JSON.parse(await readFile(path.join(root, 'node_modules/next/package.json'), 'utf8')).version,
  buildNode: process.versions.node,
};
await writeFile(path.join(destination, 'build-info.json'), JSON.stringify(buildInfo, null, 2));
// Derive native application icons from the project's existing identity.
await sharp(path.join(root, 'public/favicon.svg')).resize(1024, 1024).png()
  .toFile(path.join(root, 'desktop-build/icon.png'));
console.log(`Desktop server staged: ${destination}`);
