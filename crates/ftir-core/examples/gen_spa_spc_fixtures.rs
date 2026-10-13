//! Writes the synthetic `.spa` and `.spc` fixtures: `cargo run --release -p ftir-core --example gen_spa_spc_fixtures`.
use ftir_core::{synthetic_spa, synthetic_spc};

fn main() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    for (name, spec) in synthetic_spa::fixtures() {
        std::fs::write(
            root.join("spa").join(format!("{name}.spa")),
            synthetic_spa::build(&spec),
        )
        .expect("write fixture");
    }
    for (name, spec) in synthetic_spc::fixtures() {
        std::fs::write(
            root.join("spc").join(format!("{name}.spc")),
            synthetic_spc::build(&spec),
        )
        .expect("write fixture");
    }
}
