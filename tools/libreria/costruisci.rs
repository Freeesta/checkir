//! Builds the package of one library from `data/` with the engine itself (no second implementation):
//!
//!     cargo run --release -p ftir-lib --bin costruisci-libreria -- [--data data] [--out target/libreria] \
//!         [--library checkir-community | --config tools/libreria/librerie.json] [--date AAAA-MM-GG] \
//!         [--sampling atr_diamond|atr_ge|atr_znse|transmission_kbr|unknown] [--identity identita.csv]
//!     cargo run --release -p ftir-lib --bin costruisci-libreria -- --from-files <folder> --id <id> --private \
//!         [--out target/libreria] [--date AAAA-MM-GG] [--sampling …] [--identity identita.csv]
//!
//! `--from-files` builds ONE private package (`private: true`, licence `LicenseRef-private`) from a folder of files of any
//! format a reader recognises (subfolders included), with the rules of the page's import: one row per file, duplicates
//! (SHA-256) dropped; it writes `<out>/<id>/{manifest,index,data,native}`. `--private` is required: no public package is
//! built this way.
//!
//! `--identity` (columns `name,inchikey,substance`) gives each row the identity of its name, so the same substance under
//! different names is one substance in the margin; names the table does not know are listed in the report.
//!
//! Writes `<out>/<library>/{manifest.json,index.json,data.bin,native.bin}` (`native.bin` = the spectra as the files give them, for drawing) and the general manifest `<out>/libraries.json`
//! (`ftir-libraries/1`: one entry per package with an `enabled` switch). With `--config` every library of the file is
//! built. The manifest says how the spectra were measured (`sampling`) when every spectrum agrees: from its record
//! (`technique`) or, where the record does not say, from `--sampling` (the default of a private library). Packages are
//! never committed: CI builds them.
use ftir_core::campionamento;
use ftir_core::passi::json::parse;
use ftir_core::passi::Value;
use ftir_lib::build::{build_one, Built, Source};
use ftir_lib::files::{from_files, slug};
use ftir_lib::identity;
use ftir_lib::index::Row;
use ftir_lib::manifest::Grid;
use ftir_lib::package::{write_package, Files, Identity};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const ATTRIBUTION_EN: &str = "checkir community library, CC BY 4.0. Spectra by the contributors named in each spectrum record.";
const ATTRIBUTION_IT: &str = "Libreria comunitaria di checkir, CC BY 4.0. Spettri dei contributori indicati nella scheda di ogni spettro.";

/// One library to build: id, switch, licence and the texts shown with it (`it` may be absent).
struct LibConf {
    id: String,
    enabled: bool,
    license: String,
    attribution: (Option<String>, String),
    terms: Option<(Option<String>, String)>,
}

impl LibConf {
    fn community(id: &str, enabled: bool) -> LibConf {
        LibConf {
            id: id.to_string(),
            enabled,
            license: "CC-BY-4.0".into(),
            attribution: (Some(ATTRIBUTION_IT.into()), ATTRIBUTION_EN.into()),
            terms: None,
        }
    }
}

struct Args {
    data: PathBuf,
    out: PathBuf,
    library: String,
    config: Option<PathBuf>,
    date: String,
    sampling: Option<&'static str>,
    identity: Option<PathBuf>,
    from_files: Option<PathBuf>,
    id: Option<String>,
    private: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
        data: "data".into(),
        out: "target/libreria".into(),
        library: "checkir-community".into(),
        config: None,
        date: today(),
        sampling: None,
        identity: None,
        from_files: None,
        id: None,
        private: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        if flag == "--private" {
            a.private = true;
            continue;
        }
        let value = it.next().ok_or(format!("missing value for {flag}"))?;
        match flag.as_str() {
            "--data" => a.data = value.into(),
            "--out" => a.out = value.into(),
            "--library" => a.library = value,
            "--config" => a.config = Some(value.into()),
            "--date" => a.date = value,
            "--identity" => a.identity = Some(value.into()),
            "--from-files" => a.from_files = Some(value.into()),
            "--id" => a.id = Some(value),
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

/// Gives the rows the identity of their names from the `--identity` table (none = nothing changes); returns the names
/// the table does not know.
fn apply_identity(
    rows: &mut [(Row, Vec<f32>)],
    table: Option<&Path>,
) -> Result<Vec<String>, String> {
    let Some(path) = table else {
        return Ok(Vec::new());
    };
    let csv = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let table = identity::parse_table(&csv)?;
    let mut only: Vec<_> = rows.iter().map(|(r, _)| r.clone()).collect();
    let unknown = identity::apply(&mut only, &table);
    rows.iter_mut().zip(only).for_each(|(slot, r)| slot.0 = r);
    Ok(unknown)
}

/// Writes the four files of a package into `<out>/<name>/`.
fn write_files(out: &Path, name: &str, files: Files, native: Vec<u8>) -> Result<(), String> {
    let dir = out.join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("manifest.json"), files.manifest_json).map_err(|e| e.to_string())?;
    fs::write(dir.join("index.json"), files.index_json).map_err(|e| e.to_string())?;
    fs::write(dir.join("data.bin"), files.data_bin).map_err(|e| e.to_string())?;
    fs::write(dir.join("native.bin"), native).map_err(|e| e.to_string())
}

/// Every file under `dir` (subfolders included) as `(path relative to dir, bytes)`, in path order.
fn read_tree(dir: &Path, base: &Path, out: &mut Vec<(String, Vec<u8>)>) -> Result<(), String> {
    for p in sorted_entries(dir) {
        if p.is_dir() {
            read_tree(&p, base, out)?;
        } else {
            let rel = p
                .strip_prefix(base)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            out.push((
                rel,
                fs::read(&p).map_err(|e| format!("{}: {e}", p.display()))?,
            ));
        }
    }
    Ok(())
}

/// `--from-files`: one private package from a folder of spectra; returns the report line.
fn build_from_folder(args: &Args, folder: &Path) -> Result<String, String> {
    let id = args.id.as_deref().ok_or("--from-files needs --id")?;
    if !args.private {
        return Err("--from-files builds private packages only: add --private".into());
    }
    if id != slug(id) {
        return Err(format!(
            "--id {id}: use lower case letters, digits and single dashes"
        ));
    }
    let mut files = Vec::new();
    read_tree(folder, folder, &mut files)?;
    let mut got = from_files(&files);
    if got.rows.is_empty() {
        return Err(format!("{}: no readable spectrum", folder.display()));
    }
    let unknown = apply_identity(&mut got.rows, args.identity.as_deref())?;
    let identity = Identity {
        name: id.to_string(),
        version: "1".into(),
        date: args.date.clone(),
        license: "LicenseRef-private".into(),
        attribution_it: Some(format!(
            "Libreria privata di checkIR ({id}); uso interno, non redistribuibile"
        )),
        attribution_en: format!(
            "Private checkIR library ({id}); internal use, not redistributable"
        ),
        terms_it: None,
        terms_en: None,
        private: true,
        sampling: args
            .sampling
            .and_then(campionamento::normalise)
            .map(str::to_string),
    };
    let n = got.rows.len();
    let files = write_package(&identity, &Grid::STANDARD, got.rows).map_err(|e| e.json())?;
    write_files(&args.out, id, files, got.native)?;
    let mut report = format!(
        "{id}: {n} spectra, {} duplicates, {} unrecognized, {} skipped",
        got.repeated,
        got.unrecognized,
        got.skipped.len()
    );
    for (file, key) in &got.skipped {
        report.push_str(&format!("\n  skipped {file}: {key}"));
    }
    if args.identity.is_some() {
        report.push_str(&format!("\n{id}: {} names without identity", unknown.len()));
    }
    Ok(format!("{report} -> {}", args.out.join(id).display()))
}

/// Builds one library into `<out>/<name>/`; returns its version and number of spectra.
fn build_library(args: &Args, conf: &LibConf) -> Result<(String, usize, Vec<String>), String> {
    let name = conf.id.as_str();
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
        license: conf.license.clone(),
        attribution_it: conf.attribution.0.clone(),
        attribution_en: conf.attribution.1.clone(),
        terms_it: conf.terms.as_ref().and_then(|t| t.0.clone()),
        terms_en: conf.terms.as_ref().map(|t| t.1.clone()),
        private: false,
        sampling: library_sampling(&built, args.sampling),
    };
    let n = built.len();
    let native: Vec<u8> = built
        .iter()
        .flat_map(|b| b.native.iter().flat_map(|v| v.to_le_bytes()))
        .collect();
    let mut rows: Vec<_> = built.into_iter().map(|b| (b.row, b.values)).collect();
    let unknown = apply_identity(&mut rows, args.identity.as_deref())?;
    let files = write_package(&identity, &Grid::STANDARD, rows).map_err(|e| e.json())?;
    write_files(&args.out, name, files, native)?;
    Ok((version, n, unknown))
}

/// `{"it": …, "en": …}` of a config entry (`en` required).
fn texts(x: &Value, key: &str) -> Option<(Option<String>, String)> {
    let v = x.get(key)?;
    let en = v.get("en").and_then(Value::as_str)?.to_string();
    Some((v.get("it").and_then(Value::as_str).map(str::to_string), en))
}

/// One entry of the config file: without `license` it is a community library (CC BY 4.0, community attribution);
/// with it, `attribution` is required and `terms` (permission conditions) is optional.
fn conf_of(x: &Value, path: &Path) -> Result<LibConf, String> {
    let id = x.get("id").and_then(Value::as_str);
    let id = id.ok_or(format!("{}: a library has no id", path.display()))?;
    let enabled = !matches!(x.get("enabled"), Some(Value::Bool(false)));
    let Some(license) = x.get("license").and_then(Value::as_str) else {
        return Ok(LibConf::community(id, enabled));
    };
    let attribution = texts(x, "attribution").ok_or(format!(
        "{}: {id} has a licence but no attribution",
        path.display()
    ))?;
    Ok(LibConf {
        id: id.to_string(),
        enabled,
        license: license.to_string(),
        attribution,
        terms: texts(x, "terms"),
    })
}

/// The libraries to build: those of the config file, or the single `--library` (community).
fn wanted(args: &Args) -> Result<Vec<LibConf>, String> {
    let Some(path) = &args.config else {
        return Ok(vec![LibConf::community(&args.library, true)]);
    };
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let v = parse(&text).map_err(|_| format!("{}: not JSON", path.display()))?;
    let items = v.get("libraries").and_then(Value::as_arr);
    let items = items.ok_or(format!("{}: no libraries", path.display()))?;
    items.iter().map(|x| conf_of(x, path)).collect()
}

fn run() -> Result<String, String> {
    let args = parse_args()?;
    if let Some(folder) = &args.from_files {
        return build_from_folder(&args, folder);
    }
    let mut entries = Vec::new();
    let mut report = Vec::new();
    for conf in wanted(&args)? {
        let (name, enabled) = (conf.id.clone(), conf.enabled);
        let (version, n, unknown) = build_library(&args, &conf)?;
        entries.push(Value::Obj(vec![
            ("id".into(), Value::Str(name.clone())),
            ("path".into(), Value::Str(name.clone())),
            ("version".into(), Value::Str(version)),
            ("spectra".into(), Value::Num(n as f64)),
            ("enabled".into(), Value::Bool(enabled)),
        ]));
        report.push(format!("{name}: {n} spectra"));
        if args.identity.is_some() {
            report.push(format!(
                "{name}: {} names without identity{}",
                unknown.len(),
                if unknown.is_empty() {
                    String::new()
                } else {
                    format!(": {}", unknown.join("; "))
                }
            ));
        }
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
