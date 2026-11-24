# A claim about `case_records.copytree`, tested and withdrawn (2026-11-24)

THE CLAIM.  The homogeneity measurement's report (docs/audits/2026-11-24-homogeneity.md,
commit 1430675932) said, in its method notes, that its scratch copies were made with a
plain `cp -r` because `case_records.copytree` "breaks NRTL and Henry pair lookup".  If
true, it would matter: bin/curate/case_records.py's `copytree` is the one home through
which 137 gates copy a case before probing it.  The coordinator ruled that the remark
must be reproduced or withdrawn.

THE TEST.  `case_records.copytree(src, dst, ignore=reports/converged/design/iterations)`
-- the call the gates make, which materialises the copy -- on three FASTSET cases that
read binary pairs, each copied twice: into a fresh directory under `/tmp` (outside the
tree, no parent cascade) and into a fresh directory under `build/` (inside the tree).
Each copy run with `choupoSolve` (CHOUPO_HOME set), its result block compared with the
original case's run in place.

| case | pairs read | copy in /tmp | copy in the tree |
|---|---|---|---|
| steady/reactors/ammoniaReactor01_fixedConversion | Henry | rc 0, result identical | rc 0, result identical |
| steady/absorption/extraction01_waterButanol | NRTL (two liquids) | rc 0, result identical | rc 0, result identical |
| steady/thermoTest/model5_nrtl_flash | NRTL | rc 0, result identical | rc 0, result identical |

No refusal, no fallback to an ideal default, no missing pair in any of the six logs.

VERDICT.  NOT REPRODUCED; the remark is WITHDRAWN.  The homogeneity report recorded no
case, command or error for it, so the condition it met cannot be reconstructed; the likely
reading is a copy the general made in a way the gates do not (its probe used
`shutil.copytree`, not `case_records.copytree`, at the only copy site in
bin/curate/homogeneity_probe.py).  What this test does NOT cover: a case whose pairs are
case-local records, a sectored plant's per-sector `constant/`, and a copy placed at a
depth where a parent folder's `constant/` would be read in place of the case's.  Those are
the shapes to try first if the remark ever returns with an error to go with it.
