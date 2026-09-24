# Bundled models

`dinov2-small-int8.onnx` powers the morph editor's Auto-match. It is not in
git (24 MB): `npm run fetch-models` downloads the pinned revision of
`onnx-community/dinov2-small` (`onnx/model_quantized.onnx`, Apache-2.0) and
verifies its SHA-256. `tauri build` runs it automatically.

This README keeps the resource glob matching when the model is absent.
