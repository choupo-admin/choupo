# The evidence card — one tool call, one answer, a fixed number of bytes

> **KIND: SLICE RECORD · STATUS: BUILT 2026-11-05, slice (a)** (DEV.md 4c
> C227).  Vítor: *"uma forma extremamente eficiente de poupar tokens ... o
> aluno quando usa o chatGPT, tudo é feito através do Choupo ... para gerar
> pares binários e componentes ... e servir de apoio ao 'Evidence for this
> pair' do Explorer."*  This slice builds the two operations and the card for
> what exists TODAY; the archive index (b), the brief rewrite and the
> Explorer reading (c), and the C16 `autoPromoted` pairs (d) follow.

---

## 1. The rule

**A question about the catalogue is answered by the catalogue, in a bounded
number of bytes, and the answer never contains a number the catalogue does
not hold.**  The student's assistant asks `pairLookup` / `componentLookup`
and pastes what it returns.  The knowledge moves from prose the assistant
must read (the brief, the capabilities page, the packs) into a tool's
output, where it is GENERATED from the records and cannot drift from them.

## 2. The two operations

```
{ name p1; type pairLookup;      components ( ethanol water ); }
{ name c1; type componentLookup;  component  ethanol;          }   // or a CAS
```

`src/propertyOps/CatalogueLookup.{H,cpp}`, registered in
`PropertyOperation::registerBuiltins`.  They read the INSTALLATION catalogue
(`$CHOUPO_HOME/data/standards`, then `data/local`), not the case's
`constant/`: a question *about* the catalogue.  With no catalogue they refuse
by name.

**Provenance line (architect's ruling, C227 (a)).**  Because the subject is
the installation catalogue, a SEALED case would otherwise print a card from a
release that is not its own, unsaid.  Every card therefore carries one
mandatory line (priority 0, never dropped by the byte budget) and the result
JSON a `catalogue` object: `source` (the installation `data/standards`),
`release` (`data/standards/CATALOGUE.dat`), `caseSeal` (`sealed` /
`unsealed`), `caseRelease` (the manifest's `catalogueRelease`) and
`releaseDiffers`.  When they differ the line says `differs "..."`.  Witnesses:
`pairLookup03_provenance_stale_seal` (sealed from Choupo-2607 against an
installation of Choupo-2608); the UNSEALED state is built by
`check_lookup_budget` arm (j) in a temp dir (a shipped case must be sealed,
so it is not a tutorial).


### The honesty ladder (`pairLookup`; the first rung that answers wins)

| tier | what answers | what the card carries |
|---|---|---|
| `curated` | `parameters/<model>/<a>-<b>.dat` exists (either order, any model directory except UNIFAC) | the paste-ready `source` entry, the model, the validity span, `origin`, `reviewStatus`, the record's citation |
| `regressed` | the record names `fittedInCase` (Choupo's own regression) | the same, plus the case, the held-out verdict and AAD, the fit statistics, the studies by DOI |
| `estimate` | no record, both components are in the catalogue with `groups.unifac` and every group is in the UNIFAC table | the line that selects UNIFAC, **said to be an ESTIMATE**, with the measured warning (weak for azeotropes and partial miscibility; DEV.md C219: it misses Perry Table 15-8 by 3-6 percentage points) |
| `none` | nothing above | "I do not have this pair", why (which component is unknown or lake-only), and what the student can bring (measured data from a paper they read, for a `fitParameters` case: `docs/ai/validating-against-data.md`) |

The rung *"servable from the measurement archive but not yet fitted"* sits
between `estimate` and `none` and is **slice (b)**: the card says, on the
`none` tier, that it does not exist in this release.  A component that is only
in the group-estimate lake is not a catalogue component: the pair is `none`
and the card names it.

### `componentLookup`

A query resolves BY RECORD: a catalogue file name, then a declared alias
(`components/ALIASES`), then a CAS read from a record's `CAS` line; then an
exact match on a name, CAS or alias column of the group-estimate lake
(`data/groupEstimative/compounds.csv`).  Never by similarity.

| tier | the card |
|---|---|
| `catalogue` | identity (name, CAS, formula, MW), the record path, `reviewStatus`, which properties the record **has** and which it **lacks**, the vapour-pressure model and its `Trange`, the UNIFAC groups. Never the property values: they are in the record and a case uses the name. |
| `estimateLake` | identity and UNIFAC groups (facts) and which estimated columns exist; **"not reviewed"** and no estimated value |
| `none` | "I do not have this compound" and what to bring |

## 3. The card — format

A Choupo dictionary (never JSON/YAML), `kLookupCardBudgetBytes = 2048` bytes
at most (`CatalogueLookup.H` is the one home; `check_lookup_budget` reads it).
Over budget, the card sheds its lowest-priority LEAF lines (a leaf is one
`key value;` or one one-line block) and says `droppedFields N;` — it stays a
balanced dictionary, and the engine parses it back before publishing.

```
evidenceCard
{
  schema 1; kind pair; pair (ethanol water);
  tier curated;
  say "Catalogue pair record found; paste the entry, no coefficient is typed by hand.";
  records
  (
    {
      model NRTL; class curated;
      paste { ethanol-water { source "data/standards/parameters/NRTL/ethanol-water.dat"; } }
      origin literature; reviewStatus interim;
      validity { T_K (...); P_bar (...); }
      citation "...";
    }
  );
  announcedAbsent ( laboratories archiveSha256 extractionFilter fitAAD ... );
}
```

Fields, grouped by when they exist:

* **Carried by the records today** (filled from them, never computed here):
  `model`, `class` (`curated` | `regressed`), `paste`, `origin`,
  `reviewStatus`, `validity` (T in K, P in bar), `citation`, `fittedInCase`,
  `fit { nDataPoints rms_K identifiable maxAbsCorr }`,
  `validation { verdict heldOutPoints aad_pct maxAAD }`,
  `evidence { studies doi (...) }` (from the record's `evidence` list).
* **The C16 chain will add — OPTIONAL, ANNOUNCED ABSENT, never filled**:
  `laboratories` (the number of independent laboratories), `archiveSha256`
  (the hash of the archive file, distinct from a dataset's own `sha256`),
  `extractionFilter` (what was selected from the archive), `fitAAD`
  (the in-sample AAD, as opposed to `rms_K`), and — until a record carries
  them — `studies`, `validationAAD`, `identifiability`, `fittedInCase`.
  A field absent from the best record is listed in `announcedAbsent`; a field
  is added to the card the day a record carries it, and leaves the list in the
  same commit.  There is no placeholder value.

The result JSON carries the SAME text: block `lookupCards`, one object per
operation, `{ op, kind, tier, bytes, budgetBytes, card }` with `card` the
dictionary text.  The console prints it at verbosity ≥ 1.  The word `tier`
is pinned in the golden as a `verdict` row (`curation().tier`), and the byte
count as a `diag` row.

## 4. How the Explorer will read it (slice c; the GUI is NOT touched here)

`ExploreWorkspace.tsx` offers *Evidence for this pair* (≈ l. 1364) from the
evidence the GUI already holds.  In slice (c) it will read the card instead
of re-deriving: the dictionary text parses with the GUI's existing Choupo
dictionary reader; `tier` selects the badge (curated / regressed / estimate /
none), `records[].paste` is the copyable line, `validity` the span, and every
name in `announcedAbsent` is drawn as "not yet recorded" — never as zero.  A
second home for any of those facts in the GUI would be the arity sin; the
card is the one source and the operation is the one writer.

## 5. What it costs, measured

The bytes of the brief, the capabilities page and the packs an assistant must
read today, against the bytes of one card, are measured in DEV.md C227 (bytes
only; no token claim).  The harness measuring the assistant's own token use
is later work.

## 6. Not done, said plainly

* The measurement-archive rung and its index (slice b).
* The brief rewrite to "call the lookup and paste what it returns" (slice c).
* `autoPromoted` pairs (slice d).
* A UNIFAC check of the **interaction table** (a missing group pair refuses
  at assembly by name; the card says so).
* Case-local records: a student's own `constant/parameters/` are not
  consulted (the question is about the catalogue).
