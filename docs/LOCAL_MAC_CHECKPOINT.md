# Local Mac RC — resume checkpoint

User preference is recorded in project `AGENTS.md` and Pi's global user instructions: autonomously finish actual end-to-end acceptance, retry transient failures with backoff/cooldowns, keep durable checkpoints, install reviewed necessary skills/tools, never claim unexecuted checks passed. No infinite loops, private data exposure, security bypasses, spending or unauthorized publication.

## Target and scope

- `release/desktop-rc-1`, version **1.0.1-rc.1**, native Apple Silicon arm64 / macOS 15.1 (24B2083).
- Local working Mac app + DMG first. Windows, Intel, CI and publishing deferred. No push/tag/release/merge done; original user data untouched.
- No Developer ID/notarization credentials. Full **ad-hoc resource sealing** is implemented in `desktop/verify-package.cjs` and is strictly verified in installation/checksum tools. This is integrity, not publisher trust. No system policy/security setting changed.

## Verified before final lazy-Keychain rebuild

- DMG independently copied/ejected, read-only resources, stripped PATH/outside checkout, actual own Node/SQLite/Next module paths and PID exit: 13 app smoke checks passed.
- Real source consent defaults to personal public feeds, no initial network until Apply. Search → detail/chart → watchlist → one SSE → restart passed for CN/HK/US. All representative quotes/histories actual Eastmoney, `unverified` public latency; never Demo fallback. Final real detail times ~1.4 s; 1M histories 23/22/22 bars.
- Lifecycle: real 1.0.0 overwrite upgrade retained lists/test holdings/disabled alert/theme/Chinese; own service crash + occupied port recovers/new port with data/theme/Chinese; close/activate, 2× Retina/actual fullscreen, LaunchServices entry, missing-resource bounded error passed.
- Per-process proxy failure injection: real-mode cached cold start and restored-network relaunch passed. Not OS-wide offline/sleep evidence.
- Ten-minute actual-network soak passed twice, each 601 sec/21 samples. Last pre-seal source `765cc73`: one stream in all samples, no page errors, summed process working sets ~456–615 MiB and final ~475 MiB. Genuine automatic source timestamps observed, not forced price jumps. Need final sealed-byte soak before claiming final acceptance.
- Tests after lazy-Keychain regression: **183 passed /12 opt-in skipped**, 21 files; expected split 151 unit/32 integration. Earlier production audit: zero advisories. Production-web Demo E2E 23 passed; keep separate from real source evidence.
- Explicit 12 formerly skipped network cases all executed: six passed, six Yahoo-dependent failures (429/cooldown/no fundamentals). Two pure tests add two passes: `live-final.json` totals **8 passed/6 failed/0 skipped**. Do not hammer Yahoo to change that outcome.
- Broader earlier real probe: CN20/20, HK13/13, US38/38, indices22/26, commodities5/5, histories33/33. Point-in-time gaps ^RUT/^VIX/^TPX/^NSEI, not a promise of permanent coverage; feeds vary.

## Important fixes and honest limitations

- Bundled production modules must be copied from the standalone stage's parent through extraResources; root FileSet node_modules omission previously broke Next.
- Initial legacy preferences must be mirrored too, not just later changes, to survive port-origin changes.
- Optional metadata formerly stalled the whole detail route. It now uses one background flight, cached real fallback, bounded negative backoff, visible/refresh-enabled retry. Quotes/charts do not depend on Yahoo fundamentals. Two fixture regressions passed.
- Original link-only ad-hoc signature did not seal renamed resources. Full local sealing probe and deep/strict verification passed; sealed build generated successfully (`83a24c8`), but its startup caught unneeded Keychain access.
- A signed preview's new identity triggered native Keychain approval even for empty/keyless profiles because availability was eagerly probed. Latest pending changes make it lazy: public feeds/session keys never probe; native dialog has explicit Check/unlock action. Persisted keys remain encrypted/session-only, never plaintext. Fixture regression covers an indefinitely pending OS probe without blocking public startup.
- Final preview's **native encrypted persistence is not revalidated** without owner Keychain authorization. Default lifecycle now explicitly tests session-only/no-persistence/removal, not a fake encryption success. Opt-in `TOMTRADER_TEST_SECURE_STORAGE=1` requires standard native owner approval. Earlier pre-seal encryption success is not evidence for a changed identity. No real Finnhub account key supplied.
- Supplemental checkout-denial OS sandbox is blocked by nested Chromium sandbox initialization. Evidence `test-results/rc/nested-sandbox-blocker.txt`; do not disable Electron sandbox. Independent resources/module-resolution checks still pass.
- Physical sleep, OS reboot, whole-OS offline and multi-day endurance remain unverified.

## Finish without scope creep

1. Commit pending lazy-Keychain code/tests/docs, rebuild from clean source with `CSC_IDENTITY_AUTO_DISCOVERY=false npm run desktop:dist -- --mac --arm64`.
2. `node tools/test-installed-desktop.mjs` now also requires strict signature integrity. Then copy final DMG to the independent location from ignored `test-results/rc/install-location.txt`, eject it, run real/lifecycle/offline scripts. These use isolated profiles only.
3. Run final exact-byte soak `tools/soak-macos.mjs` with `TOMTRADER_PUBLIC_FEEDS=1` and installed executable, plus refresh web E2E and split stats. Validate report timestamps to avoid citing an old completed soak.
4. `node tools/desktop-checksums.mjs` must pass signature integrity, select current version only, record final bytes/SHA/build-info source SHA/dirty false.
5. Write `FINAL_HANDOFF.md` with final artifacts, screenshots, verified vs blocked results. Update this checkpoint as completed. Commit sanitized docs only; do not rebuild merely for handoff-doc changes. Artifact source SHA is distinct from the later doc commit.
6. No further UI/product expansion, no buying certificates or disabling security, no unrelated process termination. Keychain SecurityAgent is a system process: do not kill it. Any stalled test main may be terminated only by its verified owned PID.
