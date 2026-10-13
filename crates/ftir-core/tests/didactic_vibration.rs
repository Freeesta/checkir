//! Vibration frames and dipole of the figures of the theory section (`web/teoria/dati/molecules.json`).

use ftir_core::didactic::json::vibration_frames_json;
use ftir_core::didactic::vibration::{
    dipole_change, element_mass_u, frames, is_ir_active, momentum, norm, Atom,
};
use ftir_core::passi::json::{parse, Value};

const DATA: &str = include_str!("../../../web/teoria/dati/molecules.json");

fn vec3(v: &Value) -> [f64; 3] {
    let a = v.as_arr().unwrap();
    [
        a[0].as_f64().unwrap(),
        a[1].as_f64().unwrap(),
        a[2].as_f64().unwrap(),
    ]
}

/// Atoms of one mode of one molecule of the data file.
fn atoms(molecule: &str, mode: &str) -> Vec<Atom> {
    let doc = parse(DATA).unwrap();
    let mol = doc
        .get("molecules")
        .and_then(Value::as_arr)
        .unwrap()
        .iter()
        .find(|m| m.get("id").and_then(Value::as_str) == Some(molecule))
        .unwrap();
    let m = mol
        .get("modes")
        .and_then(Value::as_arr)
        .unwrap()
        .iter()
        .find(|m| m.get("id").and_then(Value::as_str) == Some(mode))
        .unwrap();
    let disp = m.get("displacements").and_then(Value::as_arr).unwrap();
    mol.get("atoms")
        .and_then(Value::as_arr)
        .unwrap()
        .iter()
        .zip(disp)
        .map(|(a, d)| Atom {
            mass_u: element_mass_u(a.get("el").and_then(Value::as_str).unwrap()).unwrap(),
            charge: a.get("charge").and_then(Value::as_f64).unwrap(),
            position: vec3(a.get("xyz").unwrap()),
            displacement: vec3(d),
        })
        .collect()
}

#[test]
fn every_mode_of_a_free_molecule_keeps_the_centre_of_mass_still() {
    for (mol, modes) in [
        ("co2", ["sym", "asym", "bend"]),
        ("h2o", ["sym", "bend", "asym"]),
    ] {
        for mode in modes {
            let a = atoms(mol, mode);
            let scale: f64 = a.iter().map(|x| x.mass_u * norm(x.displacement)).sum();
            assert!(
                norm(momentum(&a)) < 1e-3 * scale,
                "{mol} {mode}: {:?}",
                momentum(&a)
            );
        }
    }
}

#[test]
fn co2_symmetric_stretch_is_inactive_and_the_others_are_active() {
    let sym = atoms("co2", "sym");
    assert!(!is_ir_active(&sym));
    assert!(norm(dipole_change(&sym)) < 1e-12);
    for f in frames(&sym, 24).unwrap() {
        assert!(
            norm(f.dipole) < 1e-12,
            "dipole of the symmetric stretch must stay zero"
        );
    }
    for mode in ["asym", "bend"] {
        let a = atoms("co2", mode);
        assert!(is_ir_active(&a), "{mode}");
        let d: Vec<f64> = frames(&a, 24)
            .unwrap()
            .iter()
            .map(|f| norm(f.dipole))
            .collect();
        assert!(d.iter().cloned().fold(0.0, f64::max) > 0.1);
    }
    for mode in ["sym", "bend", "asym"] {
        assert!(is_ir_active(&atoms("h2o", mode)), "h2o {mode}");
    }
}

#[test]
fn the_dipole_follows_the_displacement_and_the_period_closes() {
    let a = atoms("co2", "asym");
    let list = frames(&a, 8).unwrap();
    assert_eq!(list.len(), 8);
    // phase 0 is the equilibrium geometry; a quarter period is the largest displacement.
    assert!(list[0]
        .positions
        .iter()
        .zip(&a)
        .all(|(p, x)| p == &x.position));
    let quarter = &list[2];
    assert!((quarter.phase_rad - std::f64::consts::FRAC_PI_2).abs() < 1e-12);
    let change = dipole_change(&a);
    for (q, c) in quarter.dipole.iter().zip(change) {
        assert!((q - c).abs() < 1e-12);
    }
    assert!((list[6].dipole[0] + change[0]).abs() < 1e-12);
}

#[test]
fn json_face_reports_activity_and_errors() {
    let json = r#"[{"el":"O","xyz":[-1,0,0],"displacement":[-0.2,0,0],"charge":-0.3},
                   {"el":"C","xyz":[0,0,0],"displacement":[0,0,0],"charge":0.6},
                   {"el":"O","xyz":[1,0,0],"displacement":[0.2,0,0],"charge":-0.3}]"#;
    let out = vibration_frames_json(json, 4).unwrap();
    assert!(out.contains("\"ir_active\":false"), "{out}");
    let doc = parse(&out).unwrap();
    assert_eq!(
        doc.get("frames").and_then(Value::as_arr).map(|f| f.len()),
        Some(4)
    );
    assert_eq!(
        vibration_frames_json("[]", 4).unwrap_err().error_key,
        "didactic.too_many_points"
    );
    assert_eq!(
        vibration_frames_json(json, 0).unwrap_err().error_key,
        "didactic.too_many_points"
    );
    let bad = r#"[{"el":"Xx","xyz":[0,0,0],"displacement":[0,0,0]}]"#;
    assert_eq!(
        vibration_frames_json(bad, 4).unwrap_err().error_key,
        "didactic.invalid_input"
    );
    assert_eq!(
        vibration_frames_json("nope", 4).unwrap_err().error_key,
        "passi.json_non_valido"
    );
}
