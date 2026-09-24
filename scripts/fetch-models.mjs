#!/usr/bin/env node
// Downloads the pinned auto-match model into src-tauri/resources/models/ and
// verifies its SHA-256. Skips when a valid copy is already there. Release
// builds run it strictly (beforeBuildCommand); dev runs pass --optional, so a
// machine without network still starts — auto-match just reports the model
// missing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODELS = [
  {
    file: 'src-tauri/resources/models/dinov2-small-int8.onnx',
    url: 'https://huggingface.co/onnx-community/dinov2-small/resolve/8b1f705a3a7f6f062f6bdd21986c1583d3ef105d/onnx/model_quantized.onnx',
    sha256: 'c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb',
  },
];

const optional = process.argv.includes('--optional');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function ensure(model) {
  const path = join(ROOT, model.file);
  if (existsSync(path) && sha(readFileSync(path)) === model.sha256) {
    console.log(`fetch-models: ${model.file} ok`);
    return;
  }
  console.log(`fetch-models: downloading ${model.file}`);
  const res = await fetch(model.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${model.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha(buf);
  if (got !== model.sha256) throw new Error(`SHA-256 mismatch for ${model.file}: got ${got}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.part`, buf);
  renameSync(`${path}.part`, path);
  console.log(`fetch-models: ${model.file} ok`);
}

try {
  for (const model of MODELS) await ensure(model);
} catch (err) {
  const msg = `fetch-models: ${err instanceof Error ? err.message : err}`;
  if (optional) {
    console.warn(`${msg}\nfetch-models: auto-match stays unavailable until the model is fetched.`);
  } else {
    console.error(msg);
    process.exit(1);
  }
}
