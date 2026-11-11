# Desktop corrective audit — 2026-11-11

This checkpoint records source fixes after the 1.0.1-rc.1 handoff. The earlier signed/ad-hoc artifact hashes in `FINAL_HANDOFF.md` do not include these changes unless a new artifact is explicitly built and verified.

## Confirmed fixes

- Native backup previously allowed selecting `profile/data/tomtrader.db`, WAL or settings as its own destination. It now refuses any destination inside the running profile, resolving directory symlinks before comparison. No actual user database was used to reproduce or test this.
- Backup previously wrote directly over existing output. It now writes a private unique temporary file beside the destination, flushes and closes it, then atomically replaces the chosen backup. Partial write or rename failure leaves the previous backup intact.
- File-menu backup errors previously opened the unrelated local-service recovery flow. They now give a backup-specific native error without restarting the service.
- A duplicate launch while the Mac app remained in the Dock with no market window previously did nothing. It now recreates the market window with the existing backend.

## Validation

- `npx vitest run tests/unit/desktop-backup.test.ts tests/unit/desktop.test.ts tests/unit/desktop-security.test.ts`: 17 passed, including active-profile aliases and injected write/rename failures.
- `node tools/test-desktop-backup.mjs`: five native Electron checks passed, using a fresh isolated temporary profile and explicitly synthetic Demo backend only for desktop behavior. It checks native bridge rejection without changing DB bytes, correct File-menu error and unchanged service PID, valid SQLite export, prior-backup preservation after partial disk write, and a real closed-window/second-instance event with a single unchanged service PID. This is not real-price evidence, physical OS sleep or cross-platform certification.
- `npx eslint desktop tests/unit/desktop-backup.test.ts tools/test-desktop-backup.mjs`: passed.
- Native test evidence: ignored local `test-results/desktop-backup/acceptance.json`; temporary test profiles are removed on completion. No installed app or personal profile was opened, no Keychain prompt was requested, and no binaries were signed/published by this audit.

Files: `desktop/main.cjs`, `desktop/runtime.cjs`, `tests/unit/desktop-backup.test.ts`, `tools/test-desktop-backup.mjs`, and the backup guidance in `docs/DESKTOP.md`.
