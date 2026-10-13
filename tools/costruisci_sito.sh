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
# The IR band data the page explains peaks with (regions, rules, groups, modes, texts, sources): one source, copied here.
mkdir -p site/bands && cp data/bands/regions.json data/bands/rules.json data/bands/groups.json data/bands/modes.json data/bands/texts.it.json data/bands/texts.en.json site/bands/ && cp data/sources.json site/bands/sources.json
node tools/genera_identita.mjs
node tools/genera_schede.mjs
wasm-bindgen --target web --no-typescript --out-dir site/wasm target/wasm32-unknown-unknown/release/ftir_wasm.wasm
# Library packages (never committed) and the general manifest with one switch per library; the service worker caches them.
cargo run --locked --release -p ftir-lib --bin costruisci-libreria -- --config tools/libreria/librerie.json --out site/librerie
# Last step: the cache version of the service worker is a hash of what it precaches (nothing to raise by hand).
node tools/versione_sw.mjs
