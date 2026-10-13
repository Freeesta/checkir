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
# The didactic IR regions (regions/1) drawn on the chart: one source, copied here.
mkdir -p site/bands && cp data/bands/regions.json site/bands/regions.json
node tools/genera_identita.mjs
wasm-bindgen --target web --no-typescript --out-dir site/wasm target/wasm32-unknown-unknown/release/ftir_wasm.wasm
# Library packages (never committed) and the general manifest with one switch per library; the service worker caches them.
cargo run --locked --release -p ftir-lib --bin costruisci-libreria -- --config tools/libreria/librerie.json --out site/librerie
