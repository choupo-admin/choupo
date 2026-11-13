# Review by measurement: the liquid-density pilot (`c378-pilot`)

`REPORT.md` is the report (two of three reviewers so far; section 6 is
still to come).  `findings.tsv` holds the rows.  `contract/` and
`numbers/` hold the reviewers' scripts and outputs; each script takes
`<repo-root> <scratch-dir>` and writes only under the scratch directory.
`numbers/iapws95.py` is an implementation of the reference equation
written from the catalogue's own coefficient record and checked against
the release's printed tables.
