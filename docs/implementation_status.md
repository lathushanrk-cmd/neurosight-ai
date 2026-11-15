# Repository implementation status

This repository currently contains research documentation. **The complete v1.2 source files from the author's uploaded ZIP have not yet been transferred to GitHub.** Do not infer that a source-code path exists on GitHub until the corresponding file is visible.

Expected files from the original project archive:

- `src/App.tsx` — React interface, camera management, monitoring, eye snapshots, plots
- `src/analysis.ts` — pupil segmentation, measurements, baseline and anomaly rules
- `src/storage.ts` — browser-local persistence
- `src/styles.css` — UI styling
- `tests/analysis.test.mjs` — numerical and missing-data test cases
- `scripts/setup-assets.mjs` — MediaPipe model acquisition and SHA-256 verification
- `package.json`, `index.html`, `tsconfig.json`, `vite.config.ts` — build and app setup
- `RUN_NEUROSIGHT.bat`, `WINDOWS_LAUNCH_GUIDE.md` — Windows startup instructions

The local archive should be retained until a complete upload and repeatable build are confirmed. The project is **experimental**, with no clinical validation or real caregiver-alert implementation.
