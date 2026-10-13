//! Per-reader action tables of the contract `anonimizza/1` (data only; the logic is in the parent module).
use super::{Action, ReaderRules, Rule};

const JCAMP: &[Rule] = &[
    keep("BLOCKID"),
    keep("BLOCKS"),
    keep("DATATABLE"),
    keep("DATATYPE"),
    keep("DELTAX"),
    keep("END"),
    keep("FIRSTX"),
    keep("FIRSTY"),
    keep("JCAMPDX"),
    keep("LASTX"),
    keep("MAXX"),
    keep("MAXY"),
    keep("MINX"),
    keep("MINY"),
    keep("NPOINTS"),
    keep("PEAKTABLE"),
    keep("PEAKWIDTHS"),
    keep("RESOLUTION"),
    keep("XFACTOR"),
    keep("XUNITS"),
    keep("XYDATA"),
    keep("XYPOINTS"),
    keep("YFACTOR"),
    keep("YUNITS"),
    keep("ZPD"),
    coarsen("DATE"),
    coarsen("LONGDATE"),
    strip("$$"),
    strip("(TEXT)"),
    strip("CASNAME"),
    strip("CASREGISTRYNO"),
    strip("CROSSREFERENCE"),
    strip("MOLFORM"),
    strip("MW"),
    strip("NAMES"),
    strip("NOTES"),
    strip("ORIGIN"),
    strip("OWNER"),
    strip("PERSON"),
    strip("SAMPLEDESCRIPTION"),
    strip("SAMPLINGPROCEDURE"),
    strip("SOURCEREFERENCE"),
    strip("SPECTROMETERDATASYSTEM"),
    strip("TITLE"),
];

/// Header lines of a text file are free text: only the three keys that give the axis stay.
const TEXT: &[Rule] = &[
    keep("FIRSTX"),
    keep("LASTX"),
    keep("NPOINTS"),
    strip("(SKIPPED)"),
];

const ISPD: &[Rule] = &[
    keep("0 ##JCAMP-DX"),
    keep("0 ##MINX"),
    keep("0 ##MINY"),
    keep("0 ##RESOLUTION"),
    keep("0 ##ZPD"),
    keep("100000"),
    keep("100001"),
    keep("100003"),
    keep("100004"),
    keep("100008"),
    keep("100022 0"),
    keep("100022 2"),
    keep("100036"),
    keep("103700 FTIRX000 Instrument Parameters"),
    keep("103701"),
    keep("105600"),
    keep("2 DisplayObject"),
    keep("AO"),
    keep("CO"),
    keep("MEMBERS"),
    // The parameter 1032 is marked as identifying by the reader; the other parameters are physical.
    strip("param.1032"),
    keep("param.*"),
    coarsen("0 ##$CORRECTIONDATE"),
    coarsen("0 ##DATE"),
    coarsen("CREATED"),
    coarsen("HISTORY_DATE"),
    strip("0 ##CASNAME"),
    strip("0 ##MOLFORM"),
    strip("0 ##MW"),
    strip("0 ##NAMES"),
    strip("0 ##NOTES"),
    strip("0 ##ORIGIN"),
    strip("0 ##OWNER"),
    strip("0 ##SAMPLEDESCRIPTION"),
    strip("0 ##SAMPLINGPROCEDURE"),
    strip("0 ##SOURCEREFERENCE"),
    strip("0 ##TITLE"),
    strip("2 Description"),
    strip("CD"),
    strip("HISTORY"),
    strip("HISTORY_AUTHOR"),
    strip("NAME"),
    strip("NON_BTREE_DATA"),
];

const SPA: &[Rule] = &[
    keep("FIRSTX"),
    keep("LASTX"),
    keep("NPOINTS"),
    keep("XUNITS"),
    keep("YUNITS"),
    coarsen("DATE"),
    strip("COMMENT"),
    strip("HISTORY"),
    strip("TITLE"),
];

const SPC: &[Rule] = &[
    keep("FIRSTX"),
    keep("LASTX"),
    keep("NPOINTS"),
    keep("SUBFILE"),
    keep("XUNITS"),
    keep("YUNITS"),
    coarsen("DATE"),
    strip("COMMENT"),
];

/// The contract: one table per reader of `READERS` (a test fails for a reader without one).
pub static CONTRACT: &[ReaderRules] = &[
    ReaderRules {
        reader: "jcamp-dx",
        rules: JCAMP,
    },
    ReaderRules {
        reader: "text-xy",
        rules: TEXT,
    },
    ReaderRules {
        reader: "shimadzu-ispd",
        rules: ISPD,
    },
    ReaderRules {
        reader: "thermo-spa",
        rules: SPA,
    },
    ReaderRules {
        reader: "galactic-spc",
        rules: SPC,
    },
];

/// Names of warning parameters that stay (numbers and fixed words); every other parameter may carry text of the file.
pub const WARNING_PARAMS_KEPT: &[&str] = &[
    "alternatives",
    "count",
    "expected",
    "factor",
    "found",
    "id",
    "limit",
    "line",
    "max",
    "method",
    "object",
    "order",
    "page",
    "reason",
    "size",
    "version",
    "what",
    "why",
];

const fn keep(key: &'static str) -> Rule {
    Rule {
        key,
        action: Action::Keep,
    }
}
const fn coarsen(key: &'static str) -> Rule {
    Rule {
        key,
        action: Action::Coarsen,
    }
}
const fn strip(key: &'static str) -> Rule {
    Rule {
        key,
        action: Action::Strip,
    }
}
