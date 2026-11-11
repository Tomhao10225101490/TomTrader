# Desktop RC acceptance — local Mac priority

Target: **1.0.1-rc.1**, Apple Silicon, macOS 15.1 (24B2083). This round does not depend on Windows, Intel, GitHub CI or publication.

- [x] Preserve existing work and real user data; work on `release/desktop-rc-1`.
- [x] Bundle Next 16.4.5 and production modules, Electron 45.3.0 / Node 24.22.2 / SQLite 3.53.4; inventory and reject escaped symlinks/private files.
- [x] Require a per-start token for all desktop HTTP/static/SSE requests; keep renderer sandbox/context isolation and validated narrow IPC.
- [x] Native source/key configuration, explicit public-feed consent, OS-encrypted credentials or explicit session-only fallback. No shared/developer key shipped.
- [x] Independently copy application from RC DMG, eject image, run without development server or developer PATH; verify real backend/Next resolution inside installed resources.
- [x] Real installed first-run/search/identity/CNY-HKD-USD/quotes/history/watchlist/restart. No unlabeled generated fallback.
- [x] Real 1.0.0 → RC replacement at the same isolated installation path retains lists, synthetic test holdings, disabled alert and appearance.
- [x] Native secure-storage fixture survives restart; never plaintext; removal works. This is not real Finnhub account verification.
- [x] macOS close/activate, explicit quit, duplicate launch, 2× Retina, actual fullscreen and resize.
- [x] Own service crash + occupied port → recovery/new port; data, theme and language retained. Bounded own-child shutdown including SSE grace timeout.
- [x] LaunchServices `open` system entry and missing-resource actionable startup failure.
- [x] Actual cached real-mode cold start with per-process upstream-network fault injection; restore network on next launch. No OS-wide networking change.
- [x] Ten-minute real-provider session: 21 samples, one steady stream, genuine automatic quote refresh timestamps, no page errors. Not multi-day endurance certification.
- [x] Default tests: 148 unit + 32 integration passed; 12 opt-in live cases remain excluded by default, not claimed as covered there.
- [x] 23 Demo production-web UI E2E cases passed separately; not live-provider evidence.
- [x] All 12 formerly skipped cases explicitly executed. Six keyless cases passed after fixing the invalid partial-session minute-count assertion; six Yahoo-dependent cases failed due to upstream 429/cooldown. Pure conversion tests add two passes. No credential key required for those 12.
- [x] Production dependency audit: zero reported advisories at this check.
- [ ] Optional stronger checkout-denial sandbox: attempted, OS refuses nested Chromium sandbox initialization; **blocked, not passed**. Normal Electron sandbox remains enabled. Independent install/resource-resolution checks pass without lowering security.
- [ ] Physical sleep/wake, whole-system offline switch, OS reboot and multi-day resource testing: not performed; injected events and ten-minute soak are labeled accurately.
- [ ] Real Finnhub account: no personal key supplied. Header/401/403/429/no-fake-fallback fixtures passed; official-only mode does not provide historical bars.
- [ ] Signing/notarization: no available identity/credentials. Local unsigned preview only; no security bypass or certificate purchase.
- [ ] Windows/Intel/native CI: deferred; no completion claims. No public release or default-branch merge.

Final artifact sizes, hashes, source provenance and evidence links: **`FINAL_HANDOFF.md`**. Any final rebuilt bytes must be reinstalled and rechecked before their hashes are delivered.
