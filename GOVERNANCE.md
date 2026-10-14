# Governance
Italiano: [GOVERNANCE.it.md](GOVERNANCE.it.md)

How decisions are made in checkIR today, and how this will change as more people join. This page describes the **current** state; when something changes, the page is rewritten.

## 1. Principles
- The program proposes, the expert decides. Nothing the program shows is a diagnosis or medical advice, and nothing is ever "safe", "pure" or "clean".
- Everything is public and traceable: every change is a pull request with its discussion.
- No server, no account system and no login of our own. Anyone can report an error through GitHub (a free account, pseudonyms allowed) with the [bug form](https://github.com/Freeesta/checkir/issues/new?template=bug.yml); GitHub, not checkIR, handles the account.
- No personal data in the project or in contributions.
- checkIR is data-processing software and a wiki: what is in `main` is published. The maintainers write and correct the texts; there are no signatures, no review states and no review deadlines. Every statement still needs a source. Editing the wiki from the site is not available.

## 2. Roles (today)
| Role | Who | What they can do |
|---|---|---|
| Reader | anyone | Use the program and read the sheets. No account, no tracking. |
| Reporter | anyone with a GitHub account, pseudonym allowed | Report an error with the bug form; discuss. No write access to the repository. |
| Maintainer | Freeesta (the GitHub account of the project owner) | Writes and corrects code and texts, merges pull requests, moderates, releases. |

- **Today there is a single maintainer.** There is no GitHub organization and no public contact address; problems are reported on GitHub (see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md)).
- Health texts (effects, doses, risks, interactions, harm reduction) are not medical advice. The doses a sheet holds are always shown, each with its source.

## 3. Who decides what
| Subject | Rule |
|---|---|
| Code (`crates/`, `web/`, `tools/`, `.github/`) | Pull request, green CI (`ci-ok`), the maintainer merges. |
| Substance sheets and health texts | Every statement has a source (`[f:id]`); the data checks in CI enforce it, also for the health sections. |
| Spectra and band rules | Provenance and licence (CC BY 4.0) declared; spectra from commercial or restricted libraries are never accepted. |
| Alerts | A source for every alert; an alert that no longer holds is withdrawn by pull request. |
| Translations | Complete catalogue; the language check passes. |
| Process, roles, this page | Changed by pull request, open for comment at least 14 days unless it fixes an error. |
- **Disagreement:** the discussion stays on the issue or pull request and the maintainer decides. When in doubt, the more cautious text (fewer claims) is published.
- **Limits of the FTIR** (components below about 5 % are not detected, potent substances in traces, no quantities) are always shown and cannot be removed.

## 4. From a report to the site
1. An error is reported with the [bug form](https://github.com/Freeesta/checkir/issues/new?template=bug.yml). The maintainer sorts it (label `triage`) within about 7 days.
2. The maintainer fixes it in a pull request; the automatic checks run (`ci-ok`): schema, sources, forbidden words, forbidden names, personal data, DCO.
3. The maintainer merges; the site is rebuilt and published. Anything published is corrected the same way, at any time; the Git history keeps every version.

## 5. Conflicts of interest
Whoever writes a change states in the pull request any tie to a producer or seller of substances, kits or instruments. Anyone can raise a concern on the pull request or through the Code of Conduct channel.

## 6. Moderation
Off-topic, abusive or unsafe content (personal data, synthesis, vendors, requests for personal dose advice) is hidden or removed, and users can be blocked, with GitHub's tools. Personal data published by mistake is removed at once, including from history when needed.

## 7. How this governance changes
- Changes to this page follow the process above. Moving to a GitHub organization, adding maintainers, or changing licences needs a decision of the project owner and is announced here first.
- Adding a login, a server or any service that handles user data would change the principles of the project and needs an explicit, documented decision of the project owner.
- Review the rules when a second maintainer or a first partner service joins.
