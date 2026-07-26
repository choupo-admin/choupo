# Completed one-shot migration scripts (provenance, not tools)

Each script here performed ONE data migration and is finished: its input is a
RETIRED layout (the pre-2026-07-18 electrolyte monoliths --
`data/standards/electrolyte/{speciation,gases,pairs,...}.dat`) that no longer
exists, deliberately.  They are kept as the executable record of HOW the
per-record chemistry/ and parameters/ trees were derived from the monoliths --
run them today and they refuse on the missing input, which is correct.

Live curation tools stay one level up in `bin/curate/`.  If a script up there
cannot run against the CURRENT tree, it belongs here.
