# Implementation status

**NEUROSIGHT AI v1.2 source is present in this GitHub repository.**

The 18 source/configuration/test files uploaded from the original project ZIP were fetched back from GitHub and matched against the uploaded archive contents exactly. The README and methodology notes are separately maintained documentation.

## Included source

- `src/App.tsx` — React interface, camera management, monitoring, eye snapshots and plots
- `src/analysis.ts` — image-based pupil estimation, measurements, baseline and anomaly rules
- `src/storage.ts` — browser-local persistence
- `src/styles.css` — visual styling
- `tests/analysis.test.mjs` — numerical and missing-data test cases
- `scripts/setup-assets.mjs` — MediaPipe model retrieval and SHA-256 verification
- `package.json`, `index.html`, `tsconfig.json`, `vite.config.ts` — build and app configuration
- `RUN_NEUROSIGHT.bat`, `WINDOWS_LAUNCH_GUIDE.md` — Windows startup instructions
- `public/` — favicon and instructions for locally generated model/WASM assets

## Not bundled

The source ZIP did not contain `node_modules/`, the installed MediaPipe `.wasm` runtime, or the face landmark `.task` model. The setup script obtains dependencies and verifies the model checksum during installation. No live webcam device or browser run was tested during this GitHub import.

## Evidence status

**Verified:** presence and byte-for-byte text equality of the 18 transferred source files.

**Not independently verified here:** a successful clean installation, webcam tracking accuracy, clinical validity, diagnosis of DLB or other neurological conditions, or actual caregiver notifications.

This repository should be described as an experimental eye-tracking and pupillometry prototype, not a clinically validated device.
