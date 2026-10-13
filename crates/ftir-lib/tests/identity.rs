//! `--identity` table of the builder: names to InChIKey/substance, unknown names reported, bad cells refused; index rows
//! without `substance` are readable and written back without it.
use ftir_lib::identity::{apply, parse_table};
use ftir_lib::index::{index_to_json, parse_index, Row};

fn row(id: &str, name: &str) -> Row {
    Row {
        id: id.into(),
        form: "base".into(),
        substance: None,
        name_it: None,
        name_en: name.into(),
        classes: Vec::new(),
        inchikey: None,
        quality: "pass".into(),
        provenance_type: "certified_standard".into(),
    }
}

const KEY: &str = "AAAAAAAAAAAAAA-BBBBBBBBBB-C";

#[test]
fn names_get_their_identity_and_unknown_ones_are_listed_once() {
    let csv = format!(
        "name,inchikey,substance\n\"MDMA\",{KEY},mdma\n92 mdma_0,{KEY},\ncaffeine,,caffeine\n"
    );
    let table = parse_table(&csv).expect("table");
    let mut rows = vec![
        row("a", "MDMA"),
        row("b", "92 MDMA_0"),
        row("c", "Caffeine"),
        row("d", "Mystery"),
        row("e", "Mystery"),
    ];
    let unknown = apply(&mut rows, &table);
    assert_eq!(unknown, vec!["Mystery".to_string()]);
    assert_eq!(rows[0].inchikey.as_deref(), Some(KEY));
    assert_eq!(rows[0].substance.as_deref(), Some("mdma"));
    assert_eq!(rows[1].inchikey.as_deref(), Some(KEY));
    assert_eq!(rows[1].substance, None);
    assert_eq!(
        (rows[2].inchikey.as_deref(), rows[2].substance.as_deref()),
        (None, Some("caffeine"))
    );
    assert_eq!(
        (rows[3].inchikey.clone(), rows[3].substance.clone()),
        (None, None)
    );
}

#[test]
fn bad_tables_are_refused() {
    assert!(parse_table("").is_err());
    assert!(parse_table("inchikey\nX\n").is_err());
    assert!(parse_table("name,inchikey\nx,not-a-key\n").is_err());
    assert!(parse_table("name,substance\nx,Bad Id\n").is_err());
    assert!(parse_table("name,substance\nx,a\nX,b\n").is_err());
    assert!(parse_table("name,substance\nx,a\nX,a\n").is_ok());
}

#[test]
fn an_index_row_may_have_no_substance() {
    let mut with = row("a", "A");
    with.substance = Some("a".into());
    let json = index_to_json(&[row("b", "B"), with]);
    let back = parse_index(&json).expect("index");
    assert_eq!(back[0].substance, None);
    assert_eq!(back[1].substance.as_deref(), Some("a"));
}
