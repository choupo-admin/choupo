# Review by measurement: the property-sources panel

Date: 2026-11-13.  Asked by the coordinator (board, R4).  Reviewed on main
at 8f7660966b; engine output from a native build of d783c6c236 (no engine
source moved between the two).  Findings: `findings.tsv` (PS-01 ..
PS-14).  Nothing was looked at in a browser: each case was run by the
native engine, and its result was fed through the web app's own adapter
and the panel's data-shaping code in a test file (`compare.test.ts.txt`,
kept here as text; it ran from a temporary place under `gui/tests`).

## 1. Verdict

**The panel shows the engine's numbers faithfully.**  Two cases, 46
entries, every field the engine publishes carried without a difference;
one engine entry is one row, nothing merged, dropped or rounded apart
(`aceticAcid02_plant.compare.txt`, `swro01_campoDalias.compare.txt`; each
engine block produced twice, byte-identical).

What is wrong is what the panel leaves out, what its tests cannot see,
and the words.

## 2. The rows that matter

| id | where | observed | consequence |
|---|---|---|---|
| PS-01 | the unit card | aceticAcid02's methanolPump card: `787.27 kg/m3`; the engine's finding, shown only in Reports: the same liquid is `785.12 kg/m3` in methanolTank | the student on the card never learns two units disagree |
| PS-02 | `gui/tests/propertySources.test.ts:95-101, 129-135` | `valueMin`/`valueMax` swapped in the adapter: 15 of 15 pass; `TMin`/`TMax` and `PMin`/`PMax` swapped: 15 of 15 pass | the test's two witnesses have no range row and no stateless row |
| PS-03 | the same test, `:104-135` | the last engine entry removed in the adapter: 15 of 15 pass | the count check compares the adapter with itself |
| PS-10 | the badge | `[bypass]` on a constant 1000 kg/m3 used because the case declared no feed density | the word is the log's DEFAULT class and is not in the guide section the badge links to |
| PS-11 | the engine | the door computes origin, evidence, provenance and each component's route; the log is handed none of them | "can I trust it at this state?" cannot be answered by any row |

## 3. The words a student meets

Shown: `kernel` and `bypass` as badges, `declared`, and two more class
words (`own`, `record`) as grey badges that no guide defines (PS-09).
The tooltip is "source class: <word>".  The Theory Guide section the
badge links to uses other names for the same classes ("Computed by the
unit itself", "A constant of the unit", ...); only the User Guide, which
the panel does not link, defines `kernel` and `bypass`.

NOT shown, on main: the source identifiers in brackets and the per-leaf
names.  Neither the panel nor the console prints them.

Per row, the question is "where did this number come from, and can I
trust it at this state?".  The label sentence answers the first half for
most rows.  The second half is answered only by the `declared` rows.  On
swro01 a student cannot tell which of two seawater densities (1031 to
1033 in the pumps, 996.9 in the tanks) describes their seawater, and
"NaCl left out" does not say whether its mass is kept.

## 4. Where the remedy is

The coordinator's reading holds: it is engine-side.

The app only DRAWS the label sentence, the finding sentences, the
consumer names and the class word.  It COMPOSES: a second copy of the
engine's display table (unit, scale, digits) and the value and state
text; the class colours and tooltip; the finding tags; and the rule for
which rows belong to a unit's card (a search for the unit's name in
quotes, which misses `inventory 'X/tank1'`: PS-08).

For the panel to need no vocabulary of its own the engine would publish,
per entry: the value and state as it prints them, with the count
(PS-05); a sentence for the class written for a student in place of the
word; the quality facts the door already computes (PS-11); for each
finding, the units it concerns (PS-01); and the flowsheet unit that owns
each sizing consumer (PS-08).

## 5. What was NOT reviewed

- Anything in a browser; the WebAssembly build.
- The narrow layout, and whether the guide link resolves in the built PDF.
- The time-integrated binaries and the props bench.
- Which name a unit card passes in a sectored plant (PS-14).
