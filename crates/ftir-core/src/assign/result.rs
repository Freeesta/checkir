//! The result of the assignment, `assignment/1` (schema in `docs/schemi/assignment-1.json`): for every peak of the
//! sample the state, who explains it (a substance, never a group rule) and the bands of the reference the sample lacks.

pub const SCHEMA: &str = "assignment/1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Explained,
    ExplainedOtherForm,
    Unexplained,
    Minor,
    Artifact,
}

impl State {
    pub fn id(self) -> &'static str {
        match self {
            State::Explained => "explained",
            State::ExplainedOtherForm => "explained_other_form",
            State::Unexplained => "unexplained",
            State::Minor => "minor",
            State::Artifact => "artifact",
        }
    }
}

/// Identity of a reference spectrum (the candidate, a component of a mixture or another form of the same substance).
#[derive(Debug, Clone, PartialEq)]
pub struct ReferenceId {
    pub spectrum_id: Option<String>,
    pub substance_id: String,
    pub form: String,
    pub library: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Explanation {
    pub substance_id: String,
    pub form: String,
    pub ref_peak_id: String,
    pub ref_peak_cm1: f64,
    pub delta_cm1: f64,
    /// From the assignment of the band in `substance-bands/2`, when the file has one.
    pub band: Option<BandInfo>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BandInfo {
    pub group: String,
    pub mode: String,
    pub group_instance: Option<String>,
    pub mode_character: Option<String>,
    pub origin: &'static str,
}

/// A reading of a peak by a group rule (`rule_id`) or by an assignment of the substance (`origin`); never an
/// explanation.
#[derive(Debug, Clone, PartialEq)]
pub struct Interpretation {
    pub rule_id: Option<String>,
    pub group: String,
    pub mode: String,
    pub rank: usize,
    pub status: String,
    pub origin: Option<&'static str>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub peak_id: String,
    pub state: State,
    pub explained_by: Option<Explanation>,
    /// At most `MAX_INTERPRETATIONS`, ranked.
    pub interpretations: Vec<Interpretation>,
    /// More readings were compatible than are listed: the region is crowded.
    pub crowded: bool,
    /// Common cuts that could explain an unexplained peak (ids), at most `MAX_SUSPECTS`.
    pub suspects: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Missing {
    pub ref_peak_id: String,
    pub ref_peak_cm1: f64,
    pub prominence_rel: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Summary {
    pub no_reference: bool,
    pub n_main: usize,
    pub n_explained: usize,
    /// `None` without a reference: the count would alarm for nothing.
    pub n_unexplained: Option<usize>,
    pub n_missing: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Assignment {
    pub sample_spectrum_id: Option<String>,
    /// Version of the group rules read; `None` when none were given.
    pub bands_version: Option<String>,
    /// The candidate; `None` without any reference.
    pub reference: Option<ReferenceId>,
    pub components: Vec<ReferenceId>,
    pub items: Vec<Item>,
    pub missing_expected: Vec<Missing>,
    pub summary: Summary,
}
