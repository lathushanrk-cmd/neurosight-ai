# NEUROSIGHT AI — Windows launch guide

## Quick start: double-click launcher

1. Unzip **NEUROSIGHT_AI.zip** into a normal folder (e.g. Documents\NEUROSIGHT_AI).
2. Install **Node.js LTS** (18 or newer; Node.js 20/22 recommended) from https://nodejs.org/ if not already installed.
3. While connected to the internet **the first time**, double-click `RUN_NEUROSIGHT.bat`.
4. The launcher runs `npm install` if necessary. A post-install script fetches and verifies the official MediaPipe face model, and copies MediaPipe's WebAssembly engine into `public/wasm/`.
5. Open `http://localhost:5173` in **Google Chrome** or **Microsoft Edge**. If the launcher does not open it automatically, type the URL manually.
6. Click **Start monitoring**, then select **Allow** in the webcam prompt.
7. Face the laptop camera in good, steady light. Look for cyan/purple iris landmarks and live values.
8. Open **Baseline Calibration** and start a 30-, 45-, or 60-second calibration. Return to Dashboard to watch the live response. The camera keeps processing while you move between tabs.
9. After calibration, continue monitoring. Use the Live Analysis, Research Mode, and Historical Analysis screens to inspect signals and export a CSV.
10. Click **Stop monitoring** to release the camera and save a session summary.

## Alternative: command line

In the extracted project directory, open Command Prompt or PowerShell and type:

```text
npm install
npm run dev
```

Open the localhost URL printed by Vite. To create a production static build, use `npm run build` then `npm run preview`.

## Does it work without internet?

First-time `npm install` **requires internet** to obtain software packages and the official face landmark model. **After successful setup**, the application loads the model and WASM locally and does not call a CDN, cloud API or external recognition server. All webcam inference runs inside the browser; runtime can be offline.

## Troubleshooting

**The browser cannot see my camera:** Use Chrome or Edge at `http://localhost:5173` (not by opening index.html directly as `file://`). Check browser site permissions and Windows Settings > Privacy & security > Camera. Close video-conferencing apps which may occupy the webcam.

**No face detection:** Keep face and both eyes clearly visible, remove obstructions, improve diffuse lighting, avoid strong backlighting, and move closer to the webcam. If tracking files are missing, run `npm run setup:assets` with internet access.

**Pupil is always “—”:** This can be scientifically correct. Ordinary webcams often lack sufficient iris pixels and contrast to locate a true pupil boundary, particularly with dark irises, low resolution, auto-exposure, glare and glasses. Iris landmarks may still work. This app does not pretend iris diameter is pupil diameter.

**`npm install` fails downloading the model:** First try `npm run setup:assets` when the network is stable. The script uses the official Google model URL and a GitHub release mirror, checks SHA-256 against a pinned fingerprint, and rejects unexpected bytes. Some institutional networks block both endpoints. If downloaded manually, save the authentic model as `public/models/face_landmarker.task` and rerun the setup script (it will verify the hash).

**The launcher says port 5173 is occupied:** Stop the other Vite server in the other terminal or use the new port printed by Vite. The launcher defaults to opening 5173; if another port is printed, open that one manually.

**Error `npm` not recognized:** Reinstall Node.js LTS and restart Command Prompt / Windows.

**Monitoring pauses when I switch tabs or minimize:** Browsers throttle video and rendering in background/minimized tabs. Keep the monitoring webpage visible. The app is not meant as an unattended safety monitor.

**Data disappears:** Browser storage can be cleared by private mode, clearing site data, or switching browsers. Export CSV regularly. Avoid personally identifying notes if you use a shared computer.

**Stop the website:** Close the command window, or press Ctrl+C inside it. The application is only reachable from your laptop (`127.0.0.1`), not on your network.

## Research limitations

This is a non-diagnostic experiment, not a validated DLB cognitive-fluctuation sensor or wandering detector. Alerts indicate sustained differences from a local baseline in image-derived ocular properties; they do not establish disease, impairment or risk. No caregiver messages are sent. The caregiver panel is only a local concept interface.
