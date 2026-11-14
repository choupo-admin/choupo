# Suggestions and bug reports

Choupo is a maintainer-led project. External code contributions, patches, and
pull requests are not accepted. This keeps the architecture, scientific
curation, release responsibility, and authorship under one accountable
maintainer.

Bug reports and concrete improvement suggestions are welcome through the
project issue tracker. A useful report includes:

- the Choupo version and operating system;
- the smallest case that reproduces the problem, when it can be shared;
- the command used and the complete refusal/error message;
- expected and observed behaviour;
- the provenance of any physical data involved.

Do not attach proprietary databases, papers, credentials, confidential plant
files, or data that you do not have permission to redistribute. A citation or
public source link is preferable.

Suggestions are advisory: submitting one does not transfer copyright, create
authorship, or guarantee implementation. The maintainer may independently
implement, adapt, postpone, or decline an idea.

The GPL-3.0-or-later licence still permits anyone to fork, modify, and
redistribute the covered code under its terms. Such forks are separate projects
and maintain their own authorship, support, and trademark identity.

A source file in the repository carries two lines: the copyright line
`Copyright (C) 2026 Vítor Geraldes` and `SPDX-License-Identifier:
GPL-3.0-or-later`, in the file's own comment syntax (engine C++ and the web
app carry the longer project banner).  `bin/header <file>` adds them, reading
the holder from the project's one table (`bin/curate/source_headers_kinds.py`)
and never from git configuration; `bin/header --check <file...>` verifies a
file; the suite's `source-headers-gate` refuses a code file without them.
