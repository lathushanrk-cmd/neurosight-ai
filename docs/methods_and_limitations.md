# Scientific methods and limitations

This document describes **what the supplied NEUROSIGHT AI v1.2 source is designed to compute**, not independently verified experimental performance.

## 1. Eye tracking versus pupillometry

MediaPipe Face Landmarker estimates a set of face and iris landmarks from a webcam image. These landmarks help approximate **iris geometry**. They do not directly identify the dark pupil boundary. NEUROSIGHT AI therefore treats iris landmarks and pupil-region estimation as **separate measurements**.

The measured iris diameter is in **image pixels**. A second, image-intensity-based method attempts to find a dark region consistent with the pupil within the eye. The software applies geometric, contrast, glare and minimum-resolution checks to reject questionable estimates. Even when a pupil boundary is returned, it is an *estimate*.

## 2. Pupil-to-iris ratio

When both estimates are usable, the program computes a dimensionless pupil-to-iris size ratio. It may reduce some scale dependence, but **does not eliminate** camera distance, head pose, off-axis gaze, lighting or optical distortions. No physical millimetre measurement is claimed.

## 3. Baseline

A 30-, 45- or 60-second calibration produces a personal reference from quality-filtered frames. A pupil-specific reference requires at least 12 valid pupil estimates; otherwise the source stores only an iris-based partial baseline. Calibration depends on device placement and illumination and does not establish a biological normal range.

## 4. Experimental monitoring rules

The program assesses one-second usable samples against the individual baseline. The v1.2 rules use four consecutive unusual usable samples for a yellow indicator and twelve for orange; five normal samples clear an alert. Poor-quality frames are marked **UNAVAILABLE**, not normal. Lighting changes can suspend assessment. These thresholds are software heuristics, not published diagnostic cutoffs.

## 5. Other measurements

- **Eye aspect ratio (EAR):** an approximate eyelid-opening measurement from landmarks, used for blink-related monitoring.
- **Rolling blink frequency:** estimated from observed blinks; susceptible to low frame rate, spectacles and occlusion.
- **Image luminance:** relative RGB pixel brightness (0–255), not a calibrated lux sensor.
- **Tracking-quality score:** an internally defined geometric/visibility heuristic, not an ML probability or clinical confidence.

## 6. Research interpretation

None of the above measures independently establishes a neurological abnormality. Illumination, pupil accommodation, gaze, fatigue, medication, camera exposure and individual variation may influence the image. A detected *image-feature deviation* must not be described as a detected dementia event.

The next research steps are a validated reference comparison, reliability testing, sensitivity analyses, and—only with appropriate consent and ethics approval—evaluation against independently established clinical or cognitive-state observations.

## 7. Implementation and reproducibility

The uploaded v1.2 ZIP includes `src/App.tsx`, `src/analysis.ts`, `src/storage.ts`, `src/styles.css`, a small analysis test suite, Vite/TypeScript configuration and a Windows launcher. The model and MediaPipe WASM files are deliberately obtained at installation rather than bundled. No measured participant cohort or clinical performance study is included in the ZIP.
