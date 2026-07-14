#!/usr/bin/env python3
# scrub_proposed.py -- deterministic IN-PLACE scrub of the token-clean candidate
# subset of data/local/components/.  Removes FALSE pedigree comment text +
# commented-out excluded coefficient blocks left behind by the 2026-06-07 ingest
# (the LIVE values were already stripped/Joback-substituted; only the comment
# text still names excluded sources -- and a commented excluded fragment is
# STILL redistribution).  Files STAY in data/local/ (no mv, no promotion).
#
# Operates ONLY on files audit_proposed.py classifies REJECT->scrubbable (no
# live excluded token, no unattributed live value).  A genuinely-contaminated
# file (live token / unattributed value) is left UNTOUCHED and stays REJECT.
#
# Two deterministic edits, comment-lines only (live data never touched):
#   1. DELETE every contiguous run of `//`-comment lines that contains a
#      commented-out coefficient TUPLE (`coefficients ( <numbers> )`) -- the
#      whole stale block (commented vaporPressure/idealGasHeatCapacity/
#      gibbsFormation/liquidHeatCapacity skeleton) goes, not just the tuple line.
#   2. In every REMAINING comment line, replace each EXCLUDED source token with
#      a neutral marker:  `<-CRC` -> `<-stripped`;  a bare/`[CRC]` mention ->
#      `[excluded source]`.  This keeps the honest "value removed, re-source"
#      note while erasing the false pedigree.
#
# After scrub, the file MUST re-audit PASS (the runner re-runs audit and
# refuses to leave a file half-scrubbed).

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROP = ROOT / 'data/local/components'

import importlib.util
spec = importlib.util.spec_from_file_location(
    'audit_proposed', Path(__file__).with_name('audit_proposed.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

EXCLUDED = audit.EXCLUDED
EXCL_TOKEN_RE = audit.EXCL_RE          # same leading-boundary matcher as the audit
# excluded token after a `<-` provenance arrow (header pedigree).  The token may
# be a prefix of a larger identifier (WAGNER_MCGARRY, PERRY151, POLING_POLY,
# CRCSTD) -- consume the WHOLE identifier + an optional `(cite-primary)` tail.
ARROW_EXCL_RE = re.compile(
    r'<-\s*[A-Za-z0-9_]*(?:' + '|'.join(EXCLUDED) + r')[A-Za-z0-9_]*'
    r'(?:\s*\([^)]*\))?', re.IGNORECASE)
# bracketed mention [CRC] / (PERRY/CRC)
BRACKET_EXCL_RE = re.compile(
    r'[\[(]\s*[^\])]*(?<![A-Za-z0-9_])(?:' + '|'.join(EXCLUDED) +
    r')[^\])]*[\])]', re.IGNORECASE)
COMMENT_COEFF_RE = audit.COMMENT_COEFF_RE


def is_comment_line(line):
    s = line.lstrip()
    return s.startswith('//') or s.startswith('*') or s.startswith('/*')


def scrub_text(text):
    lines = text.splitlines(keepends=False)
    n = len(lines)

    # ---- pass 1: drop contiguous comment runs that hold a commented coeff tuple
    drop = [False] * n
    i = 0
    while i < n:
        if is_comment_line(lines[i]):
            j = i
            while j < n and is_comment_line(lines[j]):
                j += 1
            block = lines[i:j]
            if any(COMMENT_COEFF_RE.match(b) for b in block):
                for k in range(i, j):
                    drop[k] = True
            i = j
        else:
            i += 1
    kept = [ln for k, ln in enumerate(lines) if not drop[k]]

    # ---- pass 2: neutralise excluded tokens in remaining comment lines
    out = []
    for ln in kept:
        if is_comment_line(ln) and EXCL_TOKEN_RE.search(ln):
            ln = ARROW_EXCL_RE.sub('<-stripped', ln)
            ln = BRACKET_EXCL_RE.sub('[excluded source]', ln)
            # any stray bare token left -> neutralise
            ln = EXCL_TOKEN_RE.sub('excluded-source', ln)
        out.append(ln)

    result = '\n'.join(out)
    if text.endswith('\n'):
        result += '\n'
    return result


def main():
    files = sorted(PROP.glob('*.dat'))
    scrubbed = []
    skipped_hard = []
    already_pass = []
    failed = []
    for f in files:
        verdict, scrubbable, _ = audit.audit_file(f)
        if verdict == 'PASS':
            already_pass.append(f.name)
            continue
        if not scrubbable:
            skipped_hard.append(f.name)
            continue
        new = scrub_text(f.read_text())
        f.write_text(new)
        v2, _, reasons2 = audit.audit_file(f)
        if v2 == 'PASS':
            scrubbed.append(f.name)
        else:
            failed.append((f.name, reasons2))

    print(f'already PASS (untouched): {len(already_pass)}')
    print(f'scrubbed -> now PASS:     {len(scrubbed)}')
    print(f'hard REJECT (untouched):  {len(skipped_hard)}')
    if failed:
        print(f'!! scrub did NOT clean {len(failed)} file(s):')
        for nm, rs in failed:
            print(f'   {nm}: {"; ".join(rs)}')
    else:
        print('all scrubbed files re-audit PASS.')


if __name__ == '__main__':
    main()
