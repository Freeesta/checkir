//! Writes the synthetic OPUS fixtures: `cargo run --release -p ftir-core --example gen_opus_fixtures`.
use ftir_core::synthetic::Params;
use ftir_core::synthetic_opus::{write, Spec};

fn main() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/opus");
    std::fs::create_dir_all(&dir).expect("create fixture folder");
    let p = Params::demo();
    std::fs::write(dir.join("absorbance.0"), write(&Spec::from_params(&p))).expect("write");
    std::fs::write(
        dir.join("single_channel.0"),
        write(&Spec::single_channel(&p)),
    )
    .expect("write");
}
