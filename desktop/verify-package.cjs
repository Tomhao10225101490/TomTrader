const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function verifyPackage(context) {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, 'TomTrader.app', 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  for (const relative of [
    'server/server.js',
    'server/node_modules/next/dist/server/next.js',
    'server/node_modules/next/dist/server/lib/start-server.js',
    'server/node_modules/react/package.json',
    'server/.next/BUILD_ID',
  ]) {
    if (!fs.existsSync(path.join(resources, relative))) {
      throw new Error(`Incomplete desktop package: missing ${relative}`);
    }
  }
  if (!fs.existsSync(path.join(resources, 'server/.next/static'))) {
    throw new Error('Desktop package is missing frontend static assets');
  }
  const server = path.join(resources, 'server');
  let files = 0;
  const nativeFiles = [];
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink() && !fs.realpathSync(file).startsWith(`${server}${path.sep}`)) throw new Error('Runtime symlink escapes the installed server');
      if (entry.name.startsWith('.env') || /\.(db|sqlite)(-wal|-shm)?$/.test(entry.name)) throw new Error('Private runtime data in installer');
      if (entry.isDirectory()) inspect(file);
      else {
        files++;
        if (/\.(node|dylib|dll)$/.test(entry.name)) nativeFiles.push(path.relative(server, file));
      }
    }
  }
  inspect(server);
  fs.writeFileSync(path.join(resources, 'package-integrity.json'), JSON.stringify({ runtimeFiles: files, nativeFiles, platform: context.electronPlatformName, arch: context.arch, checked: true }, null, 2));
  if (context.electronPlatformName === 'darwin' && !process.env.CSC_LINK && !process.env.CSC_NAME) {
    // Electron's linker-only ad-hoc signature does not seal the renamed app's
    // resources. Seal this local preview without a certificate or OS policy
    // change. Preserve existing entitlements/flags; do not add security bypasses.
    // A later real builder signing step, if configured, replaces this seal.
    const bundle = path.join(context.appOutDir, 'TomTrader.app');
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements,flags', '--timestamp=none', bundle], { stdio: 'pipe' });
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' });
    console.log('Local preview resource seal verified (ad-hoc only; no Developer ID/notarization claim).');
  }
};
