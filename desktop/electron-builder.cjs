module.exports = {
  appId: 'org.tomtrader.desktop',
  productName: 'TomTrader',
  artifactName: 'TomTrader-${version}-${os}-${arch}.${ext}',
  directories: { output: 'release', buildResources: 'desktop-build' },
  icon: 'desktop-build/icon.png',
  // Keep build tooling and the web application's dependencies out of app.asar.
  // The standalone server has its own traced production dependencies.
  files: ['desktop/**/*.{cjs,js,html}', 'package.json', 'LICENSE', '!node_modules/**/*'],
  // Copy from the parent directory: electron-builder deliberately omits a
  // root-level node_modules in a FileSet, even for extraResources.
  extraResources: [{ from: 'desktop-build', to: '.', filter: ['server/**/*'] }],
  afterPack: require('./verify-package.cjs'),
  asar: true,
  npmRebuild: false,
  mac: {
    category: 'public.app-category.finance',
    target: ['dmg', 'zip'],
    hardenedRuntime: true,
    entitlements: 'desktop/entitlements.mac.plist',
    entitlementsInherit: 'desktop/entitlements.mac.plist',
    notarize: Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID),
  },
  dmg: { title: 'TomTrader', contents: [
    { x: 130, y: 180, type: 'file' },
    { x: 410, y: 180, type: 'link', path: '/Applications' },
  ] },
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
  nsis: {
    oneClick: false,
    runAfterFinish: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
  },
  publish: null,
};
