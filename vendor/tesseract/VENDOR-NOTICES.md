# OCR runtime assets

Self-hosted browser runtime assets, pinned for reproducible offline loading:

- `tesseract.min.js` and `worker/worker.min.js`: Tesseract.js 5.1.1, Apache-2.0. See `LICENSE.md` and `worker/LICENSE.txt`.
- `core/tesseract-core-lstm.wasm.js`: tesseract.js-core 5.1.1, Apache-2.0. See `core/LICENSE`.
- `lang/4.0.0_best_int/por.traineddata.gz`: `@tesseract.js-data/por` 1.0.0, MIT. Portuguese best-int model for Tesseract 4.0.0.

The selected LSTM core includes its WebAssembly module in the JavaScript bundle. Assets are loaded from this application origin and precached by the service worker. OCR data and images remain on-device.
