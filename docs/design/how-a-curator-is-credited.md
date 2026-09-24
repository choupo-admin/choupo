# How a curator is credited

*2026-09-24.  Vítor asked twice for this: first "gostava que visses boas
práticas internacionais em software open source desta dimensão", and then,
when a colleague's name appeared on a guide but not on the tool she reviews,
"convinha que a pessoa que cura cada EDUTOOL estivesse mencionada".  The
survey was done the first time and **written down nowhere**, so the second
asking had to start from nothing.  That failure is the reason this file
exists, and the rule that prevents it is `CLAUDE.md` §10 + `DEV.md` §4c.*

---

## 1. The problem, concretely

Mónica Faria agreed to review the batch UF/NF membrane EduTool for
correctness.  She is not an author of the EduTools Guide, she claims no
copyright in it, and she wrote none of the engine.  What is the honest way to
say so, and where?

The first attempt got it wrong in a way worth recording: her name was written
into `docs/preamble.tex`'s `\manualauthors`, which feeds **three** sentences
on every guide's front matter — and the first of them is the **copyright
line**.  So a colleague who agreed to review a chapter was made to assert
rights in a work she does not claim.  Nothing in the tree refused it.

## 2. What the standards actually say — checked, not recalled

### CRediT (NISO CRediT, 14 contributor roles)

The role a reader would reach for is **Data curation**, and it is the wrong
one.  Its official definition is:

> "Management activities to annotate (produce metadata), scrub data and
> maintain research data (including software code, where it is necessary for
> interpreting the data itself) for initial use and later re-use."

That is research-data management.  It is not "read this teaching tool and
tell me whether it is correct".

The role that **does** fit is **Validation**:

> "Verification, whether as a part of the activity or separate, of the
> overall replication/reproducibility of results/experiments and other
> research outputs."

**So the word this project uses — "curator" — maps to CRediT *Validation*,
and explicitly NOT to CRediT *Data curation*.**  That matters because a
reader who knows CRediT will map the word the other way by reflex.  The word
stays (it is Vítor's, and the project already uses it for `bin/choupo-curate`
and the curation dossiers), but the mapping is stated here so the collision
is recorded rather than discovered.

CRediT has no role at all for reviewing educational material as such.

### CITATION.cff — the format this project ships

Checked against the schema guide: the top level defines exactly **two**
people-holding keys, `authors` and `contact`, and **no role vocabulary** —
no editor, no curator, no reviewer, no CRediT mapping.  (`editors` exists
only *nested inside a `reference`*, i.e. for a work you are citing, not for
your own contributors.)

**There is therefore no standard slot for a curator in a CITATION.cff.**
`CITATION.cff` here lists one author, Vítor Geraldes, and a curator must not
be added to it: with no role key available, a name in `authors` asserts
authorship, which is the exact error of §1 in a second file.

### The wider practice

Per-artifact, per-role credit is **not** common practice in open-source
projects of this size.  The usual shape is a single `AUTHORS` or
`CONTRIBUTORS` file with no role granularity; where a project does want
structure, the pattern that scales is one machine-readable metadata file with
every surface generated from it.

Consent before credit is the one point where the practice is unanimous and
explicit — ICMJE for authorship, rOpenSci for review — and it is a fact about
a conversation that no file and no check can verify.  It is recorded in
`AUTHORS` and stated there as unverifiable.

## 3. What was decided here, and where it departs

**A curator is named on the artifact they curate, and a curator is never an
author.**

The second half is precedented and is now enforced.  The first half is a
**departure**: nothing surveyed credits per-artifact with a role, and this
file says so rather than dressing the decision as best practice.  The reason
for departing is Vítor's and is specific to what this project is — an
EduTools corpus with "grande potencial de expansão", where a tool is opened
directly by a student who will never see a guide's front matter.  A credit
the reader never reaches is not a credit.

Three surfaces carry the roster, because no single home is reachable from
LaTeX, plain text and TypeScript at once:

| surface | file | what it carries |
|---|---|---|
| the guide's front matter | `docs/preamble.tex` (`\manualcuratorblock`) | name, affiliation, scope, and one sentence saying curation is not authorship |
| the human record | `AUTHORS` (`Curators`) | the same, plus the consent note |
| the tool itself | `gui/src/ui/methods/registry.ts` (`curator`) | name + affiliation, drawn as a visible badge on the tool |

Three homes in three languages held by **one gate** is the
`check_verdict_parity` precedent, taken for the same reason.
`check_curator_parity` refuses a curator who appears in `\manualauthors`,
holds the roster in both directions, and requires every curator to state the
scope they answer for.

## 4. Rejected

* **Putting a curator in `CITATION.cff`.**  No role key exists; a name in
  `authors` would assert authorship.
* **Calling the role CRediT "Data curation".**  The official definition is
  research-data management and does not describe this work.
* **A `contributors` key invented locally in `CITATION.cff`.**  A non-standard
  key in a standard file is read by nothing and silently ignored by every
  tool that consumes the format.
* **Crediting silently, without consent.**  Unanimous across the sources, and
  the one thing no gate can check.

## 5. Not done

* Only **one** tool declares a curator today.  The field is optional and its
  absence means "nobody has reviewed this", which is the truth for the other
  38 and must keep being so — a default curator would be a lie at scale.
* No generated single-source roster.  Three hand-kept homes plus a gate is
  the accepted cost until a fourth surface wants the same fact; at that point
  the CodeRefinery shape (one metadata file, every surface generated) is the
  one to copy.
* Nothing maps Choupo's `curator` onto CRediT *Validation* in any published
  metadata.  The mapping is recorded here and asserted nowhere a machine
  reads, deliberately: there is no format in use here that would carry it.

---

Sources consulted 2026-09-24: [CRediT contributor roles](https://credit.niso.org/),
[CRediT — Data curation](https://credit.niso.org/contributor-roles/data-curation/),
[CRediT — Validation](https://credit.niso.org/contributor-roles/validation/),
[Citation File Format schema guide](https://github.com/citation-file-format/citation-file-format/blob/main/schema-guide.md).
