# Heuristics — cited selection rules, one claim per file

A heuristic here is a **rule that helps a reader CHOOSE between defensible
alternatives**.  It is not a property, not a parameter and not a model: nothing
in the engine reads this folder.  Its one consumer is the EduTools *selection*
plane (`registry.ts`, `kind: "selection"`), where a rule is rendered beside a
number the engine computed.

The home exists because of the standing rule one layer up — *zero physics in
TypeScript* — applied to guidance: **zero heuristics in TypeScript**.  A rule of
thumb hard-coded in a component is a claim with no author, no domain and no way
to check it.

## What a record carries, and why each field is not optional

| field | why |
|---|---|
| `claim` | ONE sentence.  A rule a reader cannot hold in one sentence is a section of a textbook, not a heuristic. |
| `validity` | the conditions under which the source asserted it.  Students fail on *when a rule applies*, not on recall. |
| `notCovered` | what it says nothing about.  A rule whose limits are unstated reads as a law. |
| `authority` | `primaryLiterature` or `choupoDesignGuide` — see the asymmetry below. |
| `stances` / `topics` | what the claim speaks TO.  A record that speaks to nothing renders nowhere and is refused by the reader. |
| `conflictsWith` | named, never resolved.  Where two authorities disagree the tool shows both. |

## A GUIDE IS SIGNED; A RECORD IS CITED

Two authorities are allowed here and they are **not** interchangeable.

* `authority primaryLiterature;` — the claim comes from a published source, and
  the record carries `source { author year title publication locus }`.  **An
  uncited rule is refused entry.**  Inventing a citation converts *unsourced*
  into *falsely sourced*, which no reader and no gate can detect afterwards.

* `authority choupoDesignGuide;` — the claim is **Choupo's own**, quoted from
  `docs/designGuide.tex`, which carries an author on its title page.  Authored
  engineering judgement is legitimate provenance for prose a human reads as
  guidance.  Such a record **quotes** the guide and **points** at the section;
  it never paraphrases a guide paragraph into a second home for it.

The asymmetry is the point.  A guide says *"Vítor Geraldes says this"*; a record
travels into a tool, renders beside a computed number and reads as *"Choupo
states this"* — so a record must be able to name who else says it, or say
plainly that the author of the guide is who says it.

## `verification` — how well the citation itself is known

`source.verification` is the honesty mark, and it is machine-visible so a reader
never has to trust the font:

* `checkedCopy` — the wording was read in the source itself.
* `searchIndexQuotation` — the wording was returned by a literature search over
  the publisher's or the author's own copy, and the bibliographic record
  (journal, volume, pages) was corroborated against a publisher listing, but the
  document itself was **not opened**.  A page given under this mark is stated
  with the basis on which it is claimed, never asserted flatly.
* `generalKnowledge` — recalled, not verified.  Present in the vocabulary so
  that the state can be DECLARED rather than hidden; **no record in this folder
  uses it**, because a rule nobody checked is a rule this project does not ship.

## What is deliberately absent

Rules known to exist and **not** shipped, because no page could be honestly
given for them, are listed in `NOT-SHIPPED.md` beside this file.  A visible gap
is strictly better than an invisible falsehood.
