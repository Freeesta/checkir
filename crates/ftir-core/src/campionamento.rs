//! Sampling method of a measurement (how the sample met the light): a closed list of ids shared by the readers, the
//! library manifest and the comparison. Two spectra measured with different methods have bands that shift by a few
//! cm⁻¹ and different relative intensities, so the level "probable" is not offered between them. `unknown` is the
//! absence of the information, never a method.

/// The ids a manifest, a reader and the page may carry. `unknown` is always allowed and means "not said".
pub const IDS: [&str; 5] = [
    "atr_diamond",
    "atr_ge",
    "atr_znse",
    "transmission_kbr",
    "unknown",
];

pub const UNKNOWN: &str = "unknown";

/// The id as listed, or `None` when the text is not one of them.
pub fn known(id: &str) -> Option<&'static str> {
    IDS.iter().copied().find(|k| *k == id)
}

/// A method as stored: `None` for "not said" (absent, empty or `unknown`) and for text that is not an id.
pub fn normalise(id: &str) -> Option<&'static str> {
    known(id.trim()).filter(|k| *k != UNKNOWN)
}

/// Reads the free text of a file (JCAMP `##SAMPLING PROCEDURE`, an accessory name) into an id. A method is named
/// only when the text names the technique and, for ATR, the crystal; anything less is `None`.
pub fn classify(text: &str) -> Option<&'static str> {
    let t = text.to_ascii_lowercase();
    let has = |w: &str| t.contains(w);
    let word = |w: &str| {
        t.split(|c: char| !c.is_ascii_alphanumeric())
            .any(|x| x == w)
    };
    if has("kbr") || has("pellet") {
        return Some("transmission_kbr");
    }
    if !(word("atr") || has("attenuated") || has("total reflect")) {
        return None;
    }
    let crystals = [
        (has("diamond") || has("diamant"), "atr_diamond"),
        (has("germanium") || word("ge"), "atr_ge"),
        (
            has("znse") || has("zinc selenide") || has("selenuro"),
            "atr_znse",
        ),
    ];
    let mut named = crystals.iter().filter(|(found, _)| *found);
    match (named.next(), named.next()) {
        (Some((_, id)), None) => Some(id),
        _ => None,
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn ids_and_text() {
        assert_eq!(normalise("atr_diamond"), Some("atr_diamond"));
        assert_eq!(normalise("unknown"), None);
        assert_eq!(normalise("ATR"), None);
        assert_eq!(classify("Diamond ATR, 1 bounce"), Some("atr_diamond"));
        assert_eq!(classify("ATR (Ge crystal)"), Some("atr_ge"));
        assert_eq!(
            classify("attenuated total reflectance, ZnSe"),
            Some("atr_znse")
        );
        assert_eq!(classify("KBr pellet"), Some("transmission_kbr"));
        assert_eq!(classify("ATR"), None);
        assert_eq!(classify("ATR diamond or germanium"), None);
        assert_eq!(classify("transmission"), None);
        assert_eq!(classify("Nicolet iS5 (strategy)"), None);
    }
}
