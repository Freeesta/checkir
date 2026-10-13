//! Builds the package of one library from `data/` with the engine itself (no second implementation):
//!
//!     cargo run --release -p ftir-lib --bin costruisci-libreria -- [--data data] [--out target/libreria] \
//!         [--library checkir-community] [--date AAAA-MM-GG]
//!
//! Writes `<out>/<library>/{manifest.json,index.json,data.bin}`. Packages are never committed: CI builds them.
use ftir_lib::build::{build_one, Built, Source};
use ftir_lib::manifest::Grid;
use ftir_lib::package::{write_package, Identity};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const ATTRIBUTION_EN: &str = "checkir community library, CC BY 4.0. Spectra by the contributors named in each spectrum record.";
const ATTRIBUTION_IT: &str = "Libreria comunitaria di checkir, CC BY 4.0. Spettri dei contributori indicati nella scheda di ogni spettro.";

struct Args {
    data: PathBuf,
    out: PathBuf,
    library: String,
    date: String,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
        data: "data".into(),
        out: "target/libreria".into(),
        library: "checkir-community".into(),
        date: today(),
    };
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        let value = it.next().ok_or(format!("missing value for {flag}"))?;
        match flag.as_str() {
            "--data" => a.data = value.into(),
            "--out" => a.out = value.into(),
            "--library" => a.library = value,
            "--date" => a.date = value,
            _ => return Err(format!("unknown option {flag}")),
        }
    }
    Ok(a)
}

/// Today (UTC) as `AAAA-MM-GG`, from the system clock (civil-from-days).
fn today() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let z = (secs / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

fn sorted_entries(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(dir)
        .map(|r| r.filter_map(|e| e.ok().map(|e| e.path())).collect())
        .unwrap_or_default();
    v.sort();
    v
}

/// Every `(substance.json, spectrum .json, .jdx)` of `data/substances`, in path order.
fn collect(data: &Path) -> Result<Vec<Built>, String> {
    let grid = Grid::STANDARD;
    let mut built = Vec::new();
    for sub in sorted_entries(&data.join("substances")) {
        let substance = fs::read_to_string(sub.join("substance.json"))
            .map_err(|e| format!("{}: {e}", sub.display()))?;
        for meta in sorted_entries(&sub.join("spectra")) {
            if meta.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let spectrum =
                fs::read_to_string(&meta).map_err(|e| format!("{}: {e}", meta.display()))?;
            let jdx = fs::read(meta.with_extension("jdx"))
                .map_err(|e| format!("{}: {e}", meta.display()))?;
            let src = Source {
                substance_json: &substance,
                spectrum_json: &spectrum,
                jdx: &jdx,
            };
            built.push(
                build_one(&src, &grid)
                    .map_err(|e| format!("{}: {} {:?}", meta.display(), e.error_key, e.params))?,
            );
        }
    }
    Ok(built)
}

fn run() -> Result<String, String> {
    let args = parse_args()?;
    let mut built: Vec<Built> = collect(&args.data)?
        .into_iter()
        .filter(|b| b.library_name == args.library)
        .collect();
    built.sort_by(|a, b| a.row.id.cmp(&b.row.id));
    let version = built
        .first()
        .map(|b| b.library_version.clone())
        .ok_or("no spectrum in this library")?;
    if built.iter().any(|b| b.library_version != version) {
        return Err("the spectra declare different versions of the library".into());
    }
    let identity = Identity {
        name: args.library.clone(),
        version,
        date: args.date,
        license: "CC-BY-4.0".into(),
        attribution_it: Some(ATTRIBUTION_IT.into()),
        attribution_en: ATTRIBUTION_EN.into(),
        private: false,
    };
    let n = built.len();
    let rows = built.into_iter().map(|b| (b.row, b.values)).collect();
    let files = write_package(&identity, &Grid::STANDARD, rows).map_err(|e| e.json())?;
    let dir = args.out.join(&args.library);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("manifest.json"), files.manifest_json).map_err(|e| e.to_string())?;
    fs::write(dir.join("index.json"), files.index_json).map_err(|e| e.to_string())?;
    fs::write(dir.join("data.bin"), files.data_bin).map_err(|e| e.to_string())?;
    Ok(format!(
        "{}: {n} spectra -> {}",
        args.library,
        dir.display()
    ))
}

fn main() -> ExitCode {
    match run() {
        Ok(msg) => {
            println!("{msg}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}
