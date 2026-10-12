#!/usr/bin/env bash
# Builds the static site into site/: the page as it is, plus the engine compiled to .wasm (never committed).
set -euo pipefail
cd "$(dirname "$0")/.."
ver=$(grep -A1 'name = "wasm-bindgen"$' Cargo.lock | sed -n 's/version = "\(.*\)"/\1/p')
if ! wasm-bindgen --version 2>/dev/null | grep -q "$ver"; then
  cargo install wasm-bindgen-cli --version "$ver" --locked --force
fi
cargo build --locked --release --target wasm32-unknown-unknown -p ftir-wasm
rm -rf site && mkdir -p site && cp -r web/. site/
node tools/genera_manifest.mjs
wasm-bindgen --target web --no-typescript --out-dir site/wasm target/wasm32-unknown-unknown/release/ftir_wasm.wasm
