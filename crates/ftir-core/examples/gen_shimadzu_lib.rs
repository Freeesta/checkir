//! Writes a synthetic Shimadzu library (`.L01`, `.nam`, `.IDX`) for the browser tests: `cargo run --release -p ftir-core --example gen_shimadzu_lib -- <folder> [entries]`.
use ftir_core::synthetic_shimadzu_lib::{entries, l01, nam};

fn main() {
    let mut args = std::env::args().skip(1);
    let dir = std::path::PathBuf::from(args.next().expect("folder"));
    let count = args.next().map_or(3, |n| n.parse().expect("entries"));
    std::fs::create_dir_all(&dir).expect("create folder");
    let e = entries(count);
    std::fs::write(dir.join("Sintetica.L01"), l01(&e)).expect("write l01");
    std::fs::write(dir.join("Sintetica.nam"), nam(&e)).expect("write nam");
    std::fs::write(dir.join("Sintetica.IDX"), b"synthetic index").expect("write idx");
}
