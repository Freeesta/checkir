//! Writes the synthetic `.ispd` fixtures and their truth: `cargo run --release -p ftir-core --example gen_ispd_fixtures`.
use ftir_core::synthetic_ispd::{fixtures, truth_json};

fn main() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ispd");
    std::fs::create_dir_all(&dir).expect("create fixture folder");
    for f in fixtures() {
        std::fs::write(dir.join(format!("{}.ispd", f.name)), &f.bytes).expect("write fixture");
        std::fs::write(dir.join(format!("{}.truth.json", f.name)), truth_json(&f))
            .expect("write truth");
    }
}
