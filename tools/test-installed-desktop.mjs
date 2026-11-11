import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, readFile, writeFile, chmod, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const root = process.cwd();
const reportDirectory = path.resolve(process.env.TOMTRADER_DESKTOP_REPORT_DIR || 'test-results/desktop');
const releaseDirectory = path.resolve(process.env.TOMTRADER_RELEASE_DIR || 'release');
await mkdir(reportDirectory, { recursive: true });
const temporary = await mkdtemp(path.join(os.tmpdir(), 'TomTrader-install-'));
const report = { version, platform: process.platform, arch: process.arch, installerGenerated: false, installerInstalled: false, installedAppPassed: false };
let mount, installation;
async function writable(directory) {
  await chmod(directory, 0o755).catch(() => {});
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) await writable(path.join(directory, entry.name));
  }
}
async function readonly(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await readonly(file);
    else if (!entry.isSymbolicLink()) await chmod(file, (await lstat(file)).mode & 0o555);
  }
  await chmod(directory, 0o555);
}
try {
  if (process.platform === 'darwin') {
    const dmg = path.join(releaseDirectory, `TomTrader-${version}-mac-${process.arch}.dmg`);
    await readFile(dmg); report.installerGenerated = true;
    mount = path.join(temporary, 'mount');
    execFileSync('hdiutil', ['attach', dmg, '-readonly', '-nobrowse', '-mountpoint', mount], { stdio: 'inherit' });
    installation = path.join(temporary, 'Installed TomTrader.app');
    execFileSync('ditto', [path.join(mount, 'TomTrader.app'), installation]);
    execFileSync('hdiutil', ['detach', mount], { stdio: 'inherit' }); mount = null;
    report.installerInstalled = true;
    report.method = 'DMG → independent install directory → eject DMG → read-only resources → launch outside checkout';
    await readonly(installation);
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', installation], { stdio: 'pipe' });
    report.signatureIntegrityVerified = true;
    process.env.TOMTRADER_DESKTOP_EXECUTABLE = path.join(installation, 'Contents/MacOS/TomTrader');
    report.binary = execFileSync('file', [process.env.TOMTRADER_DESKTOP_EXECUTABLE], { encoding: 'utf8' }).trim().replace(temporary, '<isolated-install>');
  } else if (process.platform === 'win32') {
    const installer = path.join(releaseDirectory, `TomTrader-${version}-win-x64.exe`);
    await readFile(installer); report.installerGenerated = true;
    installation = path.join(temporary, 'installed');
    execFileSync(installer, ['/S', `/D=${installation}`], { timeout: 120_000, stdio: 'inherit' });
    process.env.TOMTRADER_DESKTOP_EXECUTABLE = path.join(installation, 'TomTrader.exe');
    const executable = await readFile(process.env.TOMTRADER_DESKTOP_EXECUTABLE);
    const machine = executable.readUInt16LE(executable.readUInt32LE(0x3c) + 4);
    if (machine !== 0x8664) throw new Error(`Unexpected Windows PE architecture: ${machine}`);
    report.installerInstalled = true; report.binary = 'PE x64 (0x8664)';
    report.method = 'NSIS silent install → installed EXE → isolated profile, outside checkout';
  } else throw new Error('This native installer acceptance supports macOS and Windows only');
  execFileSync(process.execPath, ['tools/smoke-desktop.mjs'], {
    cwd: root, env: { ...process.env, TOMTRADER_DESKTOP_REPORT_DIR: path.join(reportDirectory, 'installed') }, stdio: 'inherit', timeout: 180_000,
  });
  report.installedAppPassed = true;
} finally {
  await writeFile(path.join(reportDirectory, 'install.json'), JSON.stringify(report, null, 2));
  if (mount) execFileSync('hdiutil', ['detach', mount]);
  if (process.platform === 'darwin' && installation) await writable(installation);
  if (process.platform === 'win32' && report.installerInstalled) {
    const uninstaller = (await readdir(installation)).find((file) => /^Uninstall.*\.exe$/i.test(file));
    if (uninstaller) execFileSync(path.join(installation, uninstaller), ['/S'], { timeout: 120_000, stdio: 'inherit' });
  }
  await rm(temporary, { recursive: true, force: true });
}
