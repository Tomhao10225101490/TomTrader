# TomTrader desktop

TomTrader can run as an independent Electron desktop application. Users do not need Node.js, npm, a browser tab, or an independently managed server. The existing Next.js application and SQLite service run locally inside a Node utility process supplied by Electron.

## Install

Download installers from this project's [GitHub Releases](https://github.com/Tomhao10225101490/TomTrader/releases) **when a desktop release has been published**. Adding packaging code does not itself publish binaries.

- Apple Silicon Mac (M1/M2/M3/M4 and later): `TomTrader-<version>-mac-arm64.dmg`.
- Intel Mac: `TomTrader-<version>-mac-x64.dmg`.
- Windows x64: `TomTrader-<version>-win-x64.exe` (NSIS installer).
- macOS ZIP is also produced as an alternative distribution format.

On macOS open the DMG and drag TomTrader into Applications. On Windows run the EXE, choose an installation directory, then launch from the Start menu or desktop shortcut. Runtime operating-system support follows the pinned Electron release; older Windows and macOS versions are not promised. Windows ARM64 and Linux installers are not currently targets.

First launch opens a native data-source configuration window, initially highlighting real personal public feeds. Nothing connects until the user explicitly applies the selection. Offline synthetic Demo remains a separate, explicitly labeled option. The **Data** menu changes mode and restarts the app; demo and personal mode use separate databases. Provider availability and latency remain unverified. Packaging the application does not grant market-data redistribution rights.

On macOS closing the last market window keeps the application available in the Dock; activating it recreates the window. Cmd+Q quits the app and its owned service. Windows closes the app with its last window. Alerts still require a visible app client: no closed-window/closed-app background push guarantee. There is no automatic updater yet; download a newer installer and replace/reinstall the application. Keep the same profile to retain your data.

## Local files and backup

Profiles are independent from a developer checkout's `data/` directory:

- macOS: `~/Library/Application Support/TomTrader/`
- Windows: `%APPDATA%\TomTrader\`

The profile contains `data/tomtrader.db` or `data/demo.db`, Chromium's browser preferences/storage, and `desktop-settings.json`. The desktop settings file stores data-mode consent and a persistent local port. A persistent origin is important because browser preferences in localStorage are origin-specific. If another service takes that port, startup fails rather than silently opening a different service. The recovery dialog offers retry, another port, the redacted log folder, or quit. A validated UI-preference mirror preserves appearance/language even if recovery changes the port. Do not run multiple copies against the same profile.

Use **File → Open data folder** or **Open redacted log folder** to locate files. **File → Back up database…** and the Settings backup button create a consistent SQLite snapshot, including committed WAL data, through a native save dialog. This export contains personal data; do not upload it as a diagnostic. Existing v1 databases need no schema change for this RC; unversioned existing databases are backed up before transactional migration, and unknown future versions are refused without clearing data. Quit the application before copying the **whole profile** for backup, including Chromium storage if you want theme/language preferences. Windows uninstall is configured not to delete application data. There is no automatic web-profile import: the web application's portfolio JSON import/export still works; migrate complete databases only with both instances stopped and a backup retained.

## Build locally

Install Node.js 22.13+ (CI pins 22.23.3), then:

```sh
npm ci
npm run desktop:prepare  # Next standalone build, static assets, icon, notices; strips local secrets/data
npm run desktop:start   # launch staged desktop application
npm run desktop:smoke   # isolated demo profile, no personal database mutation
npm run desktop:dist    # native host's installers under release/
node tools/desktop-checksums.mjs
```

To build an unpacked application without installer creation use `npm run desktop:pack`.

Explicit native targets:

```sh
# On an Apple Silicon Mac
npm run desktop:dist -- --mac --arm64
# On an Intel Mac
npm run desktop:dist -- --mac --x64
# On Windows x64
npm run desktop:dist -- --win --x64
```

Build on the matching OS **and architecture**: standalone tracing can contain architecture-specific dependencies. Do not rename a Mac build to an EXE or assume a cross-built package has been tested. The application bundles Electron's Node runtime; its `node:sqlite` support is exercised by the desktop smoke test.

Packaged smoke test (macOS example):

```sh
TOMTRADER_DESKTOP_EXECUTABLE="$PWD/release/mac-arm64/TomTrader.app/Contents/MacOS/TomTrader" npm run desktop:smoke
```

On Windows set `TOMTRADER_DESKTOP_EXECUTABLE` to the absolute `release\win-unpacked\TomTrader.exe` path before running the same script. The test verifies startup, demo data, sandbox settings, SQLite location, a stock chart, restart, and persisted theme. Reports and a screenshot go to `test-results/desktop/`. The special `--smoke-test` argument requires an explicit absolute temporary profile and never enables personal feeds.

## CI and releases

`.github/workflows/desktop-release.yml` builds on native Apple Silicon macOS, Intel macOS and Windows x64 runners. It runs checks, creates installers, smoke-tests the **packaged executable**, and uploads installers and SHA-256 manifests as Actions artifacts. Run it manually from the Actions page to get candidate downloads without publishing a release.

A pushed `v<package.json version>` tag builds all three targets and creates a **draft** GitHub release only after all builds/tests pass. No release is published automatically. Review signing, clean-machine installation, checksums, data-source behavior, and the license notices before publishing. Increment the package version and lockfile together for later releases. No commit, tag, push or release is performed by local packaging commands.

## Signing and security warnings

Development previews are not equivalent to a public production release. Without certificate settings, the Mac build now creates and strictly verifies an ad-hoc resource seal; this is integrity checking, not Developer ID publisher trust or notarization. It preserves existing code flags/entitlements and does not change OS security settings. The builder's configured hardened runtime is applied by a real certificate-signing step when available, not certified by this ad-hoc preview. macOS may reject a downloaded unsigned/unnotarized app; Windows SmartScreen may warn about an unsigned or low-reputation installer. Do not ask users to disable OS security protections. For widespread distribution configure signing before publishing:

- macOS: `CSC_LINK` (Developer ID Application certificate as a supported path/URL/base64), `CSC_KEY_PASSWORD`; for notarization also `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` for the Windows signing certificate supported by electron-builder. Modern hardware/cloud-backed certificates may require a custom signing integration instead.
- Store these as GitHub Actions secrets, never commit them. CI can produce preview artifacts without trusted signing if secrets are absent; maintainers must check signature integrity and publisher trust separately before publication. A missing/partial notarization configuration does not constitute successful notarization.
- For a local Mac preview with ad-hoc sealing only: `CSC_IDENTITY_AUTO_DISCOVERY=false npm run desktop:dist -- --mac --arm64`.

The renderer is sandboxed, with Node integration disabled, context isolation enabled, no webviews, and only the app origin allowed for in-window navigation. A narrow preload bridge exposes source status, native configuration, a fixed connection check, and a native backup action—not arbitrary IPC, filesystem access, commands, URLs or credential retrieval. IPC validates the owning webContents/main frame and origin. The separate local configuration dialog has its own validated sender and cannot make network requests. A CSP restricts scripts/connections/resources to the app; Next's inline bootstrap still requires `unsafe-inline`, not `unsafe-eval`. External HTTP(S) links open in the system browser; arbitrary OS URL protocols are rejected. Permission requests are denied except app-origin notifications. The service binds to `127.0.0.1`, not the LAN. A random per-start session token gates all Next requests, including reads, writes, SSE and static resources. Electron main injects it only for the owned market webContents and exact loopback origin; it is never stored in page localStorage. A PID handshake identifies the owned service, and cross-origin requests are rejected. It remains a single-user local application, not a public-hosting/multi-user security boundary.

The packager strips `.env*`, developer databases and build caches, includes runtime dependencies and third-party notices, and checks key runtime files after packaging. It deliberately ignores inherited development `TOMTRADER_*` and Finnhub credentials. Users may configure their own optional Finnhub key in **Settings → Configure sources / Key** or the Data menu. Electron's asynchronous safeStorage API encrypts persisted keys using available OS storage. If unavailable, only explicit session-only use is permitted—never plaintext fallback. The ordinary market renderer has no key getter; the fixed provider endpoint uses the key only in an authentication header. Public+personal-key and Finnhub-only modes are available; Finnhub currently supplies US equity/ETF quotes, not historical candles. No developer/shared key is shipped. Logs and API errors redact secrets.

## Remaining release validation

This round prioritizes Apple Silicon macOS 15.1; Windows and Intel builds remain configured but are deferred, not certified. Native build automation is not proof that every OS install flow works. Before public release, install the DMG/EXE on clean machines, test uninstall/reinstall and upgrades, inspect code signatures/notarization, and exercise personal-feed mode over an extended session. Windows/Intel macOS execution must be verified on those actual targets; Apple Silicon results alone do not certify them. See FINAL_HANDOFF.md for the exact installed-Mac results, live-source refusals, final hashes and limitations. Physical system sleep, OS reboot and multi-day endurance must not be inferred from injected wake events or a ten-minute session.
