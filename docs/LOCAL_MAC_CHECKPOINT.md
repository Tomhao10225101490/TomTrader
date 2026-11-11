# Local Mac RC — completed handoff checkpoint

**Local Mac delivery is complete to the explicitly verified preview scope. Read `FINAL_HANDOFF.md` first.** Do not repeat packaging or claim deferred platform/security checks passed merely to make every box green.

- Product: **TomTrader 1.0.1-rc.1**, Apple Silicon arm64, macOS 15.1 (24B2083).
- Artifact source: **`140479572a0bc7b2fbaf221f057666638e03111c`**, built from a clean tree. Later handoff-document commits do not change binary provenance.
- Deliverables: `release/TomTrader-1.0.1-rc.1-mac-arm64.{dmg,zip}` and `release/mac-arm64/TomTrader.app`; exact byte counts/hashes and verified ad-hoc resource seal are in the handoff/manifest.
- Final DMG independent install/eject/read-only smoke passed 13 checks; final real CN/HK/US flow, eight lifecycle groups, process-local upstream-offline/cache recovery, and 601-second/21-sample real-network soak passed their executed checks.
- Final tests: 151 unit + 32 default integration passed; 23 production-Web Demo UI cases passed separately. Original 12 live cases all executed: six pass/six Yahoo-dependent refusals; with two pure cases the explicit suite is 8 pass/6 fail/0 skip.
- No shared/developer key or private profile data shipped. No user data deleted; all acceptance profiles isolated. No push/tag/release/merge or cross-platform CI performed for this local-first delivery.
- Known limits remain explicit: no Developer ID/notarization; final ad-hoc identity native encrypted-key persistence needs owner Keychain approval and is not revalidated; session-only is verified; no real Finnhub account supplied. Public feeds never probe/wait on Keychain.
- Nested checkout-denial sandbox test is blocked by macOS/Chromium; Electron sandbox remains enabled. Physical sleep, OS reboot, whole-OS offline, multi-day endurance, Windows and Intel execution remain unverified/deferred.
- Real public quotes are upstream data, not a promise of licensed real time or universal coverage. Missing/stale/unverified states are not replaced with Demo.
- Important fixes retained: fully bundled standalone node_modules; per-request token gate; initial preference mirror for legacy upgrade/port changes; bounded own-child shutdown; optional fundamentals cannot block chart/quote pages; complete resource sealing; lazy/explicit Keychain probe.
- User's cross-project Pi preferences are in `/Users/a1/.pi/agent/AGENTS.md`: own end-to-end user-level acceptance before declaring completion, recover with bounded backoff, save checkpoints, install only reviewed necessary skills/tools, never pretend to work while a session is stopped or bypass safety/authorization.

Local evidence is ignored by Git under `test-results/`; consult handoff links. Resume only a genuine next task or a specifically identified remaining gap, preserving real data and the published-in-chat final artifact hashes.
