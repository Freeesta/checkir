//! Builds the package of one library from `data/` with the engine itself (no second implementation):
//!
//!     cargo run --release -p ftir-lib --bin costruisci-libreria -- [--data data] [--out target/libreria] \
//!         [--library checkir-community | --config tools/libreria/librerie.json] [--date AAAA-MM-GG] \
//!         [--sampling atr_diamond|atr_ge|atr_znse|transmission_kbr|unknown]
//!
//! Writes `<out>/<library>/{manifest.json,index.json,data.bin}` and the general manifest `<out>/libraries.json`
//! (`ftir-libraries/1`: one entry per package with an `enabled` switch). With `--config` every library of the file is
//! built. The manifest says how the spectra were measured (`sampling`) when every spectrum agrees: from its record
//! (`technique`) or, where the record does not say, from `--sampling` (the default of a private library). Packages are
//! never committed: CI builds them.
use ftir_core::campionamento;
use ftir_core::passi::json::parse;
use ftir_core::passi::Value;
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
    config: Option<PathBuf>,
    date: String,
    sampling: Option<&'static str>,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
        data: "data".into(),
        out: "target/libreria".into(),
        library: "checkir-community".into(),
        config: None,
        date: today(),
        sampling: None,
    };
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        let value = it.next().ok_or(format!("missing value for {flag}"))?;
        match flag.as_str() {
            "--data" => a.data = value.into(),
            "--out" => a.out = value.into(),
            "--library" => a.library = value,
            "--config" => a.config = Some(value.into()),
            "--date" => a.date = value,
            "--sampling" => {
                a.sampling = Some(
                    campionamento::known(&value)
                        .ok_or(format!("unknown sampling method {value}"))?,
                )
            }
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

/// The sampling of a whole library: the one every spectrum has (its own record, else `default`); `None` when they
/// differ or nothing says.
fn library_sampling(built: &[Built], default: Option<&'static str>) -> Option<String> {
    let mut all = built.iter().map(|b| b.sampling.or(default));
    let first = all.next()??;
    all.all(|m| m == Some(first))
        .then_some(first)
        .and_then(campionamento::normalise)
        .map(str::to_string)
}

/// Builds one library into `<out>/<name>/`; returns its version and number of spectra.
fn build_library(args: &Args, name: &str) -> Result<(String, usize), String> {
    let mut built: Vec<Built> = collect(&args.data)?
        .into_iter()
        .filter(|b| b.library_name == name)
        .collect();
    built.sort_by(|a, b| a.row.id.cmp(&b.row.id));
    let version = built
        .first()
        .map(|b| b.library_version.clone())
        .ok_or(format!("{name}: no spectrum in this library"))?;
    if built.iter().any(|b| b.library_version != version) {
        return Err(format!("{name}: the spectra declare different versions"));
    }
    let identity = Identity {
        name: name.to_string(),
        version: version.clone(),
        date: args.date.clone(),
        license: "CC-BY-4.0".into(),
        attribution_it: Some(ATTRIBUTION_IT.into()),
        attribution_en: ATTRIBUTION_EN.into(),
        private: false,
        sampling: library_sampling(&built, args.sampling),
    };
    let n = built.len();
    let rows = built.into_iter().map(|b| (b.row, b.values)).collect();
    let files = write_package(&identity, &Grid::STANDARD, rows).map_err(|e| e.json())?;
    let dir = args.out.join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("manifest.json"), files.manifest_json).map_err(|e| e.to_string())?;
    fs::write(dir.join("index.json"), files.index_json).map_err(|e| e.to_string())?;
    fs::write(dir.join("data.bin"), files.data_bin).map_err(|e| e.to_string())?;
    Ok((version, n))
}

/// The libraries to build as `(id, enabled)`: those of the config file, or the single `--library`.
fn wanted(args: &Args) -> Result<Vec<(String, bool)>, String> {
    let Some(path) = &args.config else {
        return Ok(vec![(args.library.clone(), true)]);
    };
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let v = parse(&text).map_err(|_| format!("{}: not JSON", path.display()))?;
    let items = v.get("libraries").and_then(Value::as_arr);
    let items = items.ok_or(format!("{}: no libraries", path.display()))?;
    items
        .iter()
        .map(|x| {
            let id = x.get("id").and_then(Value::as_str);
            let on = !matches!(x.get("enabled"), Some(Value::Bool(false)));
            id.map(|id| (id.to_string(), on))
                .ok_or(format!("{}: a library has no id", path.display()))
        })
        .collect()
}

fn run() -> Result<String, String> {
    let args = parse_args()?;
    let mut entries = Vec::new();
    let mut report = Vec::new();
    for (name, enabled) in wanted(&args)? {
        let (version, n) = build_library(&args, &name)?;
        entries.push(Value::Obj(vec![
            ("id".into(), Value::Str(name.clone())),
            ("path".into(), Value::Str(name.clone())),
            ("version".into(), Value::Str(version)),
            ("spectra".into(), Value::Num(n as f64)),
            ("enabled".into(), Value::Bool(enabled)),
        ]));
        report.push(format!("{name}: {n} spectra"));
    }
    let general = Value::Obj(vec![
        ("schema".into(), Value::Str("ftir-libraries/1".into())),
        ("libraries".into(), Value::Arr(entries)),
    ]);
    fs::write(args.out.join("libraries.json"), general.write()).map_err(|e| e.to_string())?;
    Ok(format!("{} -> {}", report.join(", "), args.out.display()))
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
