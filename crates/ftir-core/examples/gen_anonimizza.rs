//! Rewrites the contract document checked against its schema: `cargo run --release -p ftir-core --example gen_anonimizza`.
use ftir_core::anonimizza::contract_json;

fn main() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixture/schemi/anonimizza/valid");
    std::fs::create_dir_all(&dir).expect("create fixture folder");
    std::fs::write(dir.join("contratto.json"), contract_json()).expect("write contract");
}
