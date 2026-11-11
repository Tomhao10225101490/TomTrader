# 2026-11-11 local Mac repair checkpoint

User requested comprehensive review of the updated project and completion of recoverable local issues. Baseline HEAD: 545e536; initial tree clean. Preserve original user profiles/databases and the prior RC artifact hashes. No publication, spending, security bypasses or Keychain prompts are authorized by this repair scope. API key is optional; genuine free data and honest unavailable states remain required.

Baseline: 183 Vitest passed / 12 opt-in external tests skipped; lint passed. Existing RC is 1.0.1-rc.1 (1404795 binary provenance). New changes are not yet in that binary.

In progress:
- Desktop audit: startup/settings/backup/window lifecycle and focused regressions.
- Feed audit: fix closed-session TTL surviving market open and missing initial snapshots for additional SSE clients.
- Client audit: fix stale subscription ref-map cleanup and old catch-up overwriting new stream frames/paused state.
- Root: portfolio import/update validation, atomic imports, consistent quote/valuation refresh, full build/browser + isolated genuine-feed acceptance.

Evidence for this pass goes under test-results/night-2026-11-11/. Do not count Demo interaction tests as real financial-feed verification. Network failures use bounded attempts/provider cooldowns. Record exact results and remaining external/system prerequisites before final handoff.

Update: version advanced to 1.0.1-rc.2 for a separate local repair build. Baseline full browser run 44/44; repaired full run 47/47; added failed-delete + async/portfolio focused browser regressions 4/4. Final full suite is pending further provider/user-store edits. Desktop native backup/closed-window flow 5/5 in isolated profile. Root portfolio import writes are now atomic and defaults use instrument currency; null JSON/import double-submit and delayed valuation are covered. Native pack/install output must use `release/night-2026-11-11/`, preserving prior RC1 DMG/ZIP.

Actual current network scan: EM 89/98 direct quotes, Tencent79/79, pipeline CN20/HK13/US38/index22/commodity5 available. ALL 33 EM histories failed (`fetch failed` / upstream socket closed); preserved in `test-results/night-2026-11-11/free-feeds-before-fallback.json`. Do not claim history success. A normal Tencent daily-history endpoint works; fallback implementation/protocol validation is in progress. Minute endpoints also refused; do not synthesize intraday OHLC. Global rate limits remain honored.

Final source-validation phase: actual service-chain scan recovered **13/33** historical plans through Tencent, including CN/HK/US 1M/1Y and seven CN/HK index histories. Quote coverage remains CN20/20, HK13/13, US38/38, indices22/26, commodities5/5. The other 20 plans are honestly unavailable (including intraday and unsupported overseas index histories); this is not the prior 33/33 history success claim. Raw direct failure, pipeline recovery, and six detailed real sequences are preserved independently.

Final source regression run: **219 passed / 12 opt-in network tests skipped**, 28 files. Build/lint passed. **Full 50-case production-browser run passed (50/50, ~1.3 minutes).** Installer packaging and independently installed real-source checks follow. Source work is on `codex/night-fixes-20261111`. No publishing or user-profile mutations.
