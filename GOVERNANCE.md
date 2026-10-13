# Governance
Italiano: [GOVERNANCE.it.md](GOVERNANCE.it.md)

How decisions are made in checkIR today, and how this will change as more people join. This page describes the **current** state; when something changes, the page is rewritten.

## 1. Principles
- The program proposes, the expert decides. Nothing the program shows is a diagnosis or medical advice, and nothing is ever "safe", "pure" or "clean".
- Everything is public and traceable: every change is a pull request with its discussion.
- No server, no account system and no login of our own. Anyone can propose a change through GitHub (a free account, pseudonyms allowed) using the [issue forms](https://github.com/Freeesta/checkir/issues/new/choose); GitHub, not checkIR, handles the account.
- No personal data in the project, in contributions or in the review process.

## 2. Roles (today)
| Role | Who | What they can do |
|---|---|---|
| Reader | anyone | Use the program, read sheets and history. No account, no tracking. |
| Proposer | anyone with a GitHub account, pseudonym allowed | Open issues and pull requests; discuss. No write access to the repository. |
| Reviewer | people listed in [data/reviewers.json](data/reviewers.json) | Approve pull requests for the content their role covers. They have no write access. |
| Maintainer | Freeesta (the GitHub account of the project owner) | Merges pull requests, edits `data/reviewers.json`, moderates, releases. |

- **Today there is a single person** who is both the only maintainer and the only reviewer. There is no GitHub organization and no public contact address; problems are reported on GitHub (see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md)).
- **No health-professional sign-off is currently required.** Health texts (effects, doses, risks, interactions, harm reduction) are reviewed by the reviewer above, who is not a health professional. Until a health professional joins, sheets must say that their health texts have **not** been reviewed by one, and must not be presented as medical advice. Doses are never shown for potent substances.

## 3. Who decides what
| Subject | Decided by | Rule |
|---|---|---|
| Code (`crates/`, `web/`, `tools/`, `.github/`) | Maintainer | Pull request, green CI (`ci-ok`), maintainer merges. |
| Substance sheets and health texts | Reviewer | Every health statement has a source; the proposer never approves their own proposal. |
| Spectra and band rules | Reviewer | Provenance and licence (CC BY 4.0) declared; spectra from commercial or restricted libraries are never accepted. |
| Urgent alerts | Reviewer | Published at once but visibly marked "under review"; full review within 30 days or withdrawn. |
| Translations | Reviewer | Complete catalogue; the language check passes. |
| Process, roles, this page | Maintainer | Changed by pull request, open for comment at least 14 days unless it fixes an error. |
- **Disagreement:** between a proposer and the reviewer, the reviewer decides; the discussion stays open. When in doubt, the more cautious text (fewer claims, more warnings) is published.
- **Limits of the FTIR** (components below about 5 % are not detected, potent substances in traces, no quantities) are always shown and cannot be removed by a contribution.

## 4. Review flow
1. A proposal arrives as an issue or pull request. The maintainer sorts it (labels such as `needs-review`) within about 7 days.
2. Automatic checks run: schema, sources, forbidden words, forbidden names, personal data, DCO.
3. The reviewer discusses and approves or asks for changes. Expected time: sheets and spectra within about 30 days.
4. The maintainer merges; the site is rebuilt and published. The proposer is credited under the public name or pseudonym of their choice (CC BY-SA requires attribution).
5. Pull requests with no activity for 60 days get a reminder; at 120 days they are closed and can be reopened.

## 5. Becoming a reviewer
1. Open a Discussion or an issue saying which role you would like (chemist, health, language) and which languages you read.
2. The maintainer checks your qualification (for a chemist, an affiliation to a drug checking service, a public laboratory or a university, or two references from active reviewers; for a health reviewer, registration in a professional register or an attestation from an institution). Proof is never published and no copy of an identity document is kept.
3. The maintainer adds you to `data/reviewers.json` by pull request, with a short reason. Only public data is listed: GitHub name, public name (or pseudonym), role, languages, month of verification and expiry.
4. A role lasts 24 months and can be renewed. It is suspended or revoked for inactivity over 12 months, a breach of the Code of Conduct, an undeclared conflict of interest, a repeated serious error, or on request. A compromised account is suspended immediately.
5. When more than one reviewer is active: every health section needs a reviewer with the health role; spectra are checked by a chemist from a different service than the contributor; urgent alerts need two reviewers. Until then, the rules above (one reviewer) apply and sheets show "internal review by a single reviewer".

## 6. Conflicts of interest
A reviewer states in the pull request any tie to a producer or seller of substances, kits or instruments, and does not approve content where such a tie exists. Anyone can raise a concern on the pull request or through the Code of Conduct channel.

## 7. Expired reviews
Every sheet has a review date and a "review by" date (at most 24 months). After that date the sheet shows a notice that the information may be out of date and the dose table is hidden until renewed. A renewal-only pull request (new date, no text change) is allowed.

## 8. Moderation
Off-topic, abusive or unsafe content (personal data, synthesis, vendors, requests for personal dose advice) is hidden or removed, and users can be blocked, with GitHub's tools. Personal data published by mistake is removed at once, including from history when needed.

## 9. How this governance changes
- Changes to this page follow the process above. Moving to a GitHub organization, adding maintainers, or changing licences needs a decision of the project owner and is announced here first.
- Adding a login, a server or any service that handles user data would change the principles of the project and needs an explicit, documented decision of the project owner.
- Review the rules when a second maintainer, a first health reviewer, or a first partner service joins.
