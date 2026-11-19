#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""pairs_by_name -- a binary pair is found by NAME, never by a path written in a case
(DEV.md 4c C433, Vitor 2026-11-18: "porque tens o link dos binarios e nao tens o
link dos componentes?"; "Se houver excecao, os parametros tem de ficar na pasta em
que isso acontece!").

The engine resolves a pair `<i>-<j>` of a binaryParameters / binaryInteractions
block, or a Henry solute-solvent pair, through ONE cascade (src/thermo/PairByName.H):
the case's own constant/parameters/<Model>/ (and a sector's), then
data/standards/parameters/<Model>/, then data/local.  This tool holds the same
rule for the shipped corpus.

  --report   classify every pair entry of tutorials/**/thermoPhysPropDict
  --apply    rewrite the corpus (once; idempotent afterwards):
               `<i>-<j> { source "<path>"; }`   ->  `<i>-<j> { }`   after proving
                  the path IS the file the cascade finds (any that is not is a
                  DEFECT FOUND: printed, and its record moved into the case's
                  folder, declared);
               an INLINE pair equal to the catalogue's  ->  `<i>-<j> { }`;
               an INLINE pair that differs, or has no catalogue record  ->  the
                  case's own record constant/parameters/<Model>/<file>, declared
                  `variationOf <name>;` when the catalogue holds one of that name,
                  and the entry reads `<i>-<j> { }`.
  --check    exit 1 when the shipped corpus still carries a `source` pair address
             or an inline pair the rule does not allow.  Wired as a gate arm.

THE REAL DEFECT THE CHECK WOULD HAVE CAUGHT: flash02_ethanol_water retyped the five
NRTL numbers of data/standards/parameters/NRTL/ethanol-water.dat inline, and
greenAmmoniaPEQ_baseCase named three Henry records by their `data/standards/...`
path: a fact with two homes, one of which no gate compared with the other.

AN INLINE PAIR STAYS where a fit varies it: a number under regression has no other
home (the entry's path is named by a `binaryParameters.<pair>.<key>` line in the
case's system/ or curation/ files).  data/curation/ is the curation corpus (its
fits' inputs); it is read, never rewritten, by this tool.
"""
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards" / "parameters"
SORTED_MODELS = ("NRTL", "UNIQUAC", "Wilson")
NUM_KEYS = ("a_ij", "b_ij", "a_ji", "b_ji", "c_ij", "c_ji", "alpha")


def blank_comments(t):
    t = re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), t, flags=re.S)
    return re.sub(r'//[^\n]*', lambda m: ' ' * len(m.group(0)), t)


def match_close(t, i):
    d = 1
    while i < len(t) and d:
        d += {'{': 1, '}': -1}.get(t[i], 0)
        i += 1
    return i


def file_names(model, key):
    d = key.find('-')
    sw = key[d + 1:] + '-' + key[:d] if d >= 0 else key
    if model == 'Henry':
        return [key + '.dat']                # solute-solvent, ordered
    if model in SORTED_MODELS:
        return [(key if key < sw else sw) + '.dat']
    return [key + '.dat'] + ([sw + '.dat'] if sw != key else [])


def enclosing(t, pos):
    """(open, close) of the innermost block that contains pos."""
    depth = 0
    i = pos
    while i > 0:
        i -= 1
        if t[i] == '}':
            depth += 1
        elif t[i] == '{':
            if depth == 0:
                return i, match_close(t, i + 1)
            depth -= 1
    return None


def block_name(t, open_pos):
    m = re.search(r'([\w\.\-]+)\s*$', t[:open_pos])
    return m.group(1) if m else ''


def entries(path):
    """Every pair entry of one dict: dict(kind, key, model, start, end, body, text)."""
    return entries_of_text(path.read_text())


def named_pair_subs(text):
    """The standards-relative records a dict's BY-NAME pair entries read (the
    importer's closure harvest, bin/choupo-import: a sealed copy must carry each).
    `<i>-<j> { }` and `<i>-<j> { set <n>; }` only; typed numbers read no record."""
    out = []
    for e in entries_of_text(text):
        if parse_params(e['body']) and set(parse_params(e['body'])) - {'set'}:
            continue
        if re.search(r'\bsource\b', e['body']) or not e['model']:
            continue
        for n in file_names(e['model'], e['key']):
            out.append('parameters/%s/%s' % (e['model'], n))
    return out


def entries_of_text(raw):
    t = blank_comments(raw)
    out = []
    for m in re.finditer(r'\b(binaryParameters|binaryInteractions)\s*\{', t):
        close = match_close(t, m.end())
        body = t[m.end():close - 1]
        owner = enclosing(t, m.start())
        oname = block_name(t, owner[0]) if owner else ''
        if m.group(1) == 'binaryParameters':
            if oname == 'solutes':
                model = 'Henry'
            else:
                mm = re.search(r'\bmodel\s+(\w+)\s*;', t[owner[0] + 1:owner[1]]) if owner else None
                model = mm.group(1) if mm else ''
        else:
            mm = re.search(r'\bmodel\s+(\w+)\s*;', t[owner[0] + 1:owner[1]]) if owner else None
            model = mm.group(1) if mm else ''
            if model == 'LeeKeslerPloecker':
                model = 'LKP'
        for em in re.finditer(r'([^\s{};]+)\s*\{', body):
            if body[:em.start()].count('{') - body[:em.start()].count('}') != 0:
                continue
            e2 = match_close(body, em.end())
            a = m.end() + em.end() - 1            # the '{' of the entry
            b = m.end() + e2                     # one past its '}'
            out.append(dict(kind=m.group(1), key=em.group(1), model=model,
                            start=a, end=b, body=body[em.end():e2 - 1],
                            raw=raw))
    return out


def parse_params(body):
    """key -> value of every `key value;` statement of a flat dict body."""
    d = {}
    for stmt in body.split(';'):
        m = re.match(r'^[\s{}]*([A-Za-z_]\w*)\s+([^\s{}]+)\s*$', stmt)
        if m:
            d[m.group(1)] = m.group(2)
    return d


def catalogue_record(model, key):
    for n in file_names(model, key):
        p = STD / model / n
        if p.is_file():
            return p
    return None


def case_levels(case_dir, model, fname):
    """Case-level files the engine's cascade finds for this pair, nearest first:
    the NEAREST constant/parameters/<Model>/ folder walking UP from the run folder
    (it is the whole answer for that level -- a plant-root copy is invisible from a
    sector that has a folder of its own), then every level of the case below it."""
    out = []
    d = case_dir
    for _ in range(8):
        folder = d / 'constant' / 'parameters' / model
        if folder.is_dir():
            if (folder / fname).is_file():
                out.append(folder / fname)
            break
        if d.parent == d:
            break
        d = d.parent
    for p in sorted(case_dir.rglob(fname)):
        if p.parent.name == model and p.parent.parent.name == 'parameters' \
                and p.parent.parent.parent.name == 'constant' and p not in out:
            out.append(p)
    return out


def sealed_case(case_dir):
    """Is the nearest manifest a SEALED one (the catalogue forbidden)?"""
    import case_records
    d = case_dir
    for _ in range(8):
        m = d / 'constant' / 'propertyManifest'
        if m.is_file():
            mf = case_records.read_manifest(m)
            return bool(mf['sealed'] or mf['records'])
        if d.parent == d:
            break
        d = d.parent
    return False


def cascade(case_dir, model, key):
    """-> (path, level) the engine's by-name cascade finds, or (None, None)."""
    for n in file_names(model, key):
        lv = case_levels(case_dir, model, n)
        if lv:
            return lv[0], 'case'
    c = catalogue_record(model, key)
    return (c, 'catalogue') if c else (None, None)


def rec_params(p):
    t = blank_comments(p.read_text())
    m = re.search(r'\bparameters\s*\{', t)
    if not m or re.search(r'\bsets\s*\{', t):
        return None
    return parse_params(t[m.end():match_close(t, m.end()) - 1])


def same_numbers(inl, rec):
    """Equal after orientation: floats to 1e-12 relative, same key set."""
    inl = dict(inl)
    if inl.get('i') != rec.get('i') and inl.get('i') == rec.get('j'):
        sw = {'a_ij': 'a_ji', 'a_ji': 'a_ij', 'b_ij': 'b_ji', 'b_ji': 'b_ij',
              'c_ij': 'c_ji', 'c_ji': 'c_ij', 'i': 'j', 'j': 'i'}
        inl = {sw.get(k, k): v for k, v in inl.items()}
    ik = {k for k in inl if k in NUM_KEYS}
    rk = {k for k in rec if k in NUM_KEYS}
    if ik != rk or (inl.get('i'), inl.get('j')) != (rec.get('i'), rec.get('j')):
        return False
    for k in ik:
        a, b = float(inl[k]), float(rec[k])
        if abs(a - b) > 1e-12 * max(1.0, abs(a), abs(b)):
            return False
    return True


def fit_varied(case_dir, key):
    """Is this pair named by a fit's path in the case's own files?"""
    pat = re.compile(r'binaryParameters\.' + re.escape(key) + r'\.')
    for sub in ('system', 'curation'):
        for f in (case_dir / sub).rglob('*') if (case_dir / sub).is_dir() else []:
            if f.is_file():
                try:
                    if pat.search(f.read_text(errors='replace')):
                        return True
                except OSError:
                    pass
    return False


def case_of(path):
    """The folder whose constant/ the dict reads (the case, or the sector)."""
    return path.parent.parent if path.parent.name in ('constant', 'system') else path.parent


def thermo_dicts():
    """Every tutorial dict that can declare a pair: the case's thermoPhysPropDict
    and a thermo{} block of a propsDict / flowsheetDict (a per-op or per-unit
    model)."""
    out = []
    for name in ('thermoPhysPropDict', 'propsDict', 'flowsheetDict'):
        for f in (ROOT / 'tutorials').rglob(name):
            if 'binaryParameters' in f.read_text(errors='replace') or \
               'binaryInteractions' in f.read_text(errors='replace'):
                out.append(f)
    return sorted(out)


def classify():
    rows = []
    for f in thermo_dicts():
        cdir = case_of(f)
        for e in entries(f):
            if e['kind'] == 'binaryInteractions':
                body = e['body']
                if not re.search(r'\bsource\b', body):
                    continue            # inline kij under regression (variedBy)
            e['file'] = f
            e['case'] = cdir
            src = re.search(r'\bsource\s+"([^"]*)"', e['body'])
            e['source'] = src.group(1) if src else None
            e['set'] = re.search(r'\bset\s+(\w+)\s*;', e['body'])
            body_keys = set(parse_params(e['body']))
            if e['source']:
                e['class'] = 'source'
            elif body_keys <= {'set'}:
                e['class'] = 'byName'
            elif fit_varied(cdir, e['key']):
                e['class'] = 'inlineFit'
            else:
                e['class'] = 'inline'
            rows.append(e)
    return rows


def prove_source(e):
    """-> (ok, message).  The path must be the catalogue file of (model, key) and
    no case level may hold a file of that name (it would be found first)."""
    m = e['model']
    src = e['source']
    names = file_names(m, e['key'])
    want = ['data/standards/parameters/%s/%s' % (m, n) for n in names]
    if m == 'LKP' or e['kind'] == 'binaryInteractions':
        # a kij SET record is a mixture, not a pair: out of this rewrite
        p = ROOT / src
        if p.is_file() and 'eosBinaryInteractionSet' in p.read_text():
            return None, 'kij set record (kept: a mixture, not a (model,i,j))'
    if src not in want:
        return False, 'source %s is not the cascade name %s' % (src, want)
    cat = ROOT / src
    shadow = case_levels(e['case'], m, Path(src).name)
    if shadow:
        # the cascade finds the case's own file first -- which is what the old
        # `data/standards/...` path read too (the mirrored form).  Fine when the
        # catalogue holds no record of that name; with a homonym the case record
        # must declare what it is.
        if cat.is_file() and not re.search(r'(?m)^\s*(overlayOf|variationOf|distinctFrom)\s',
                                           blank_comments(shadow[0].read_text())):
            return False, 'case record %s shadows the catalogue without a declaration' % shadow[0].relative_to(ROOT)
        return True, ''
    if not cat.is_file():
        return False, 'source file does not exist'
    return True, ''


def render_record(e, params, prov, cat_exists):
    m = e['model']
    i, j = params.get('i'), params.get('j')
    L = ['/*---------------------------------------------------------------------------*\\',
         '  %s binary interaction parameters --- %s + %s, the CASE\'S OWN record'
         % (m, i, j),
         '  (C433: a pair is found by name; an exception to the catalogue is a record',
         '  in the case\'s own folder, declared).',
         '\\*---------------------------------------------------------------------------*/',
         '', 'recordType binaryInteractionParameters;', 'schemaVersion 1;', '']
    if cat_exists:
        L += ['variationOf %s;' % Path(file_names(m, e['key'])[0]).stem,
              'variationReason "%s";' % prov['reason'], '']
    L += ['components  ( %s  %s );' % (i, j), 'model       %s;' % m, '',
          'pair { i %s; j %s; }' % (i, j), '', 'parameters', '{']
    for k, v in params.items():
        L.append('    %-10s %s;' % (k, v))
    L += ['}', '', 'provenance', '{', '    origin        %s;' % prov['origin'],
          '    citation      "%s";' % prov['citation'].replace('"', "'")]
    if prov.get('interim'):
        L += ['    reviewStatus  interim;',
              '    reviewReason  "%s";' % prov['interim'].replace('"', "'")]
    if prov.get('notes'):
        L.append('    notes         "%s";' % prov['notes'].replace('"', "'"))
    L += ['}', '']
    return '\n'.join(L)


def plan_of(rows):
    """(entry, action, detail) per pair entry.  Actions: source (provably the
    cascade's file), defect (it is not), inlineEqual (the numbers are the cascade's
    file's), inlineEqualSealed (the same, in a SEALED case: the catalogue is forbidden,
    so the case's closure takes a plain copy), inlineOwn (a record of the case's own),
    inlineFit (a value a fit varies: stays inline)."""
    plan = []
    for e in rows:
        if e['class'] == 'source':
            ok, msg = prove_source(e)
            if ok is None:
                continue
            plan.append((e, 'source' if ok else 'defect', msg))
        elif e['class'] == 'inline':
            params = parse_params(e['body'])
            cat, lvl = cascade(e['case'], e['model'], e['key'])
            eq = False
            if cat is not None:
                rp = rec_params(cat)
                eq = rp is not None and same_numbers(params, rp)
            act = 'inlineOwn'
            if eq:
                act = 'inlineEqualSealed' if (lvl == 'catalogue' and sealed_case(e['case'])) \
                    else 'inlineEqual'
            plan.append((e, act, ('%s: %s' % (lvl, cat.relative_to(ROOT))) if cat
                         else 'no record at any level'))
        elif e['class'] == 'inlineFit':
            plan.append((e, 'inlineFit', ''))
    return plan


def problems():
    """The gate arm: every entry the rule does not allow, each with its remedy."""
    out = []
    for e, a, d in plan_of(classify()):
        if a in ('source', 'defect', 'inlineEqual', 'inlineEqualSealed', 'inlineOwn'):
            what = ('a `source` path' if a in ('source', 'defect')
                    else 'inline numbers')
            out.append("%s: %s (%s) carries %s -- a pair is found by NAME.  Remedy: write `%s { }`"
                       " and, for a pair that is the case's own, a record in the case's"
                       " constant/parameters/%s/ (python3 bin/curate/pairs_by_name.py --apply)"
                       % (e['file'].relative_to(ROOT), e['key'], e['model'], what,
                          e['key'], e['model']))
    return out


def main(argv):
    mode = argv[1] if len(argv) > 1 else '--report'
    rows = classify()
    from pairs_by_name_provenance import PROVENANCE as prov
    plan = plan_of(rows)
    if mode == '--report':
        from collections import Counter
        for e, a, d in plan:
            print('%-12s %-60s %-28s %s' % (a, str(e['file'].relative_to(ROOT).parent.parent),
                                            e['key'], d))
        print(Counter(a for _, a, _ in plan))
        return 0
    if mode == '--check':
        n = 0
        for e, a, d in plan:
            if a in ('source', 'defect', 'inlineEqual', 'inlineEqualSealed', 'inlineOwn'):
                n += 1
                print('%s: %s `%s` still carries %s' % (e['file'].relative_to(ROOT), e['key'],
                      e['model'], 'a source path' if a in ('source', 'defect') else 'inline numbers'))
        print('pairs_by_name: %d entr%s the rule does not allow; %d inline kept under a fit'
              % (n, 'y' if n == 1 else 'ies', sum(1 for _, a, _ in plan if a == 'inlineFit')))
        return 1 if n else 0
    if mode == '--apply':
        by_file = {}
        for e, a, d in plan:
            by_file.setdefault(e['file'], []).append((e, a, d))
        wrote = []
        for f, items in by_file.items():
            txt = f.read_text()
            for e, a, d in sorted(items, key=lambda x: -x[0]['start']):
                if a == 'inlineFit':
                    continue
                setv = e['set'].group(1) if e['set'] else None
                new = '{ set %s; }' % setv if setv else '{ }'
                if a == 'inlineEqualSealed':
                    cat = catalogue_record(e['model'], e['key'])
                    dest = e['case'] / 'constant' / 'parameters' / e['model'] / cat.name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    if not dest.exists():
                        shutil.copyfile(cat, dest)
                        wrote.append(str(dest.relative_to(ROOT)))
                if a in ('inlineOwn', 'defect'):
                    params = parse_params(e['body'])
                    if a == 'defect':
                        # move the pointed-at record into the case, declared
                        srcp = ROOT / e['source']
                        params = rec_params(srcp)
                    key = (str(f.relative_to(ROOT)), e['key'])
                    p = prov.get('%s::%s' % key) or (
                        prov.get('ARTIFICIAL') if e['key'].startswith('comp') else None)
                    if p is None:
                        print('NO PROVENANCE for %s %s' % key)
                        continue
                    cat = catalogue_record(e['model'], e['key'])
                    rec = render_record(e, params, p, cat is not None)
                    dest = e['case'] / 'constant' / 'parameters' / e['model'] / file_names(e['model'], e['key'])[0]
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    if dest.exists() and dest.read_text() != rec:
                        print('CONFLICT: two different records for %s' % dest)
                        return 1
                    if not dest.exists():
                        wrote.append(str(dest.relative_to(ROOT)))
                    dest.write_text(rec)
                txt = txt[:e['start']] + new + txt[e['end']:]
            f.write_text(txt)
        print('rewrote %d dicts; wrote %d case records' % (len(by_file), len(wrote)))
        for w in wrote:
            print('  record', w)
        return 0
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
