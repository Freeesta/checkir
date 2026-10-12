//! Shared helpers of the reader tests: independent inventory of a JCAMP file and the loss audit.
#![allow(dead_code)]
use ftir_core::readers::model::Document;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// Independent inventory: every `##` line as `(line number, normalised label)`. Does not use the reader.
pub fn inventory(bytes: &[u8]) -> Vec<(usize, String)> {
    let text = String::from_utf8_lossy(bytes);
    let mut out = Vec::new();
    let mut n = 0usize;
    let mut rest: &str = &text;
    while !rest.is_empty() {
        n += 1;
        let end = rest.find(['\r', '\n']).unwrap_or(rest.len());
        let line = &rest[..end];
        if let Some(body) = line.trim_start().strip_prefix("##") {
            let label = body.split('=').next().unwrap_or("");
            let norm: String = label
                .chars()
                .filter(|c| !matches!(c, ' ' | '\t' | '-' | '/' | '_'))
                .flat_map(char::to_uppercase)
                .collect();
            out.push((n, norm));
        }
        let tail = &rest[end..];
        let skip = if tail.starts_with("\r\n") {
            2
        } else {
            tail.len().min(1)
        };
        rest = &tail[skip..];
    }
    out
}

pub fn list_lines(s: &str) -> Vec<String> {
    s.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| l.split('|').next().unwrap_or("").trim().to_string())
        .collect()
}

/// Every `##` line must be a field (by origin) or listed in `scarti`; returns the list of uncovered lines.
pub fn uncovered(bytes: &[u8], doc: &Document, scarti: &[String]) -> Vec<(usize, String)> {
    let mut seen: BTreeSet<usize> = BTreeSet::new();
    let all = doc
        .fields
        .iter()
        .chain(doc.spectra.iter().flat_map(|s| s.fields.iter()));
    for f in all {
        if let Some(rest) = f.origin.strip_prefix("line ") {
            if let Some(n) = rest
                .split_whitespace()
                .next()
                .and_then(|n| n.parse::<usize>().ok())
            {
                if rest.contains("##") {
                    seen.insert(n);
                }
            }
        }
    }
    inventory(bytes)
        .into_iter()
        .filter(|(n, l)| !seen.contains(n) && !scarti.contains(l))
        .collect()
}

/// Folder of the private repository (variable `CHECKIR_DATA`); tests that need it skip without it.
pub fn private_dir() -> Option<PathBuf> {
    std::env::var_os("CHECKIR_DATA")
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
}

pub fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk(&p, out);
        } else {
            out.push(p);
        }
    }
}

pub fn scarti() -> Vec<String> {
    list_lines(include_str!("../audit/scarti_jcamp.txt"))
}
