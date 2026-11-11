# Local Mac RC — resume checkpoint

User preference: continue implementing through transient failures, retry with backoff/cooldowns, keep durable state; do not stop at plans. Scope remains this repository and safe local preview delivery, not security bypasses, spending or public publication.

## Current verified state

- Branch `release/desktop-rc-1`; base implementation `fd2d9cb`, optional-metadata blocking fix `11c2d48`. Source version `1.0.1-rc.1`.
- Apple Silicon arm64, macOS 15.1 (24B2083). No signing identity/notarization credentials; unsigned local preview.
- Final installed real-market acceptance after the metadata fix **passed**: `test-results/rc/real-installed/acceptance.json`. Explicit first-run personal public-feed consent, CN/HK/US search/identity/currencies, actual Eastmoney quotes and 23/22/22 one-month bars, UI charts, watchlist add, one stream and restart retention. Initial source-consent → overview 430 ms; detail pages ~1.4 s. Closed markets are correctly cached/unverified, not asserted to be live.
- `test-results/rc/final-installed.txt`: independent DMG copy/eject/read-only resources smoke passed 13 checks. Own bundled backend/Next paths and service PID exit checked.
- `test-results/rc/lifecycle/acceptance.json`: eight lifecycle groups passed (real 1.0.0 upgrade preserving isolated user data, OS secure-storage fixture, close/activate, Retina 2×/actual fullscreen, crashed own service + occupied port recovery, clean PATH independent install, LaunchServices entry, missing resources bounded failure).
- `test-results/rc/offline/acceptance.json`: actual process-local upstream proxy failure injection cold-start/cache/no-Demo and restored-network relaunch passed. This is not a whole-OS offline switch.
- Default tests after regression fix: 182 passed / 12 opt-in skipped, 21 files. Split is 150 unit and 32 integration. Production dependency audit zero advisories. 23 production web E2E cases passed before metadata fix; re-run for final state.
- Explicit live suite `test-results/rc/live-final.json`: 8 passed / 6 failed / 0 skipped. Of the formerly skipped 12: six passed, six Yahoo-dependent cases failed from 429/cooldown (including no fundamentals). Minute-bar assertion was fixed to accept valid partial sessions; no failure-to-skip conversions.
- Broader actual feed probe: CN20/20, HK13/13, US38/38, indices22/26, commodities5/5, histories33/33. Missing ^RUT, ^VIX, ^TPX, ^NSEI in that run. Network variability may change coverage; do not claim universal/SLA real time.
- Initial 601-second real installed watchlist soak passed, 21 samples and genuine automatic source refreshes (CN three / HK seven unique received times), zero page errors, steady one stream after connection, summed process working sets ~456–615 MiB. A second ten-minute soak of `11c2d48` is/was running: supervisor PID recorded in terminal, current output `test-results/rc/final-soak.txt`, report `test-results/rc/soak/acceptance.json`; verify timestamps before citing completion.

## Important discovered/fixed bugs

- Root production node_modules/Next omission: extraResources copies fully staged standalone server. Do not regress builder FileSet behavior.
- Port recovery initially lost theme after legacy upgrade: mirror the initial localStorage preference value, not just changes. Native preference read validates owned main frame during provisional navigation.
- Final real recheck caught optional Yahoo metadata stalling `/api/detail` past client timeout although actual quotes/history existed. Service now starts one metadata job, returns immediately for detail, preserves cached metadata, bounds negative-cache entries, and backs off 60 seconds. Client retries metadata while visible and refresh enabled. Two fixture regressions prove delayed/failing fundamentals cannot block details.
- Supplemental external sandbox checkout-denial test is **blocked**, not passed: macOS refuses nested Chromium sandbox initialization. Evidence `test-results/rc/nested-sandbox-blocker.txt`. Never disable Electron sandbox to work around it. Ordinary independent install, clean PATH and actual module resolution pass.

## Remaining delivery steps

1. A pending one-line UI clarification explicitly prefixes receive-age with Received/接收时间 (keeps vendor timestamp distinct). Commit it, build from clean source, retain exact source SHA/build-info.
2. Reinstall final DMG into independent temp app, eject DMG, repeat installed smoke/real/lifecycle/offline. Do not overwrite an app while a soak is still using it; create another temp installation if necessary. Executable location is in ignored `test-results/rc/install-location.txt`.
3. Run final 23 web UI E2E tests and refresh split test JSON. Record actual soak completion (do not cite stale acceptance.json from a prior run).
4. Generate **current-version-only** checksums/manifests after final installed evidence. `node tools/desktop-checksums.mjs`; it now excludes old 1.0.0 artifacts.
5. Write concise `FINAL_HANDOFF.md` with exact final bytes/SHA/source, screenshot links, verified vs blocked results. Commit documentation without rebuilding solely for doc changes; identify artifact source commit separately from handoff-doc commit.
6. Preserve all real user data. Do not push/tag/create a Release for the local-Mac-first task unless explicitly proceeding under existing authorization; none has been done this round. Windows/Intel/CI/signing/physical sleep/OS reboot/multi-day soak remain deferred or unverified, not local-Mac blockers.
