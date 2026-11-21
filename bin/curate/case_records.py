#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""case_records -- the Python face of the record resolver (DEV.md 4c C413, D6).

A case names its components and models; the records come from
data/standards/ unless the case carries one of its own.  The engine resolves
that at ONE seam (src/thermo/RecordResolver.H): the nearest constant/<sub>
walking up, else data/standards/<sub>.  This module is the same rule for the
tools, so a gate that reads ONE record of ONE case by path asks here instead of
hard-coding `<case>/constant/components/<name>.dat` -- which stops existing the
moment the case is flipped from copies to pins.

  record_path(case, sub)     the file the engine would read for `sub` (the
                             standards-relative name, e.g. components/water.dat):
                             the case-local file first, else the catalogue's.
  copy_constant(case, dest)  a copy of the case's constant/ a probe can run on
                             outside the tree: the case's own files, and the
                             manifest dropped when it holds pins (the probe then
                             reads the catalogue exactly as the flipped case does).
  read_manifest(manifest)    {sealed, pins, held, records} parsed from the text.
  cases_pinning(root, sub)   every case whose manifest pins `sub` -- the exact
                             reach of an edit to that catalogue record.
  pinned_case_dirs(root)     every case directory whose manifest holds `pins`.

No hash is computed here: the computational hash is the ENGINE's
(`choupoProps --canonical-hash`), one implementation (bin/choupo-import
canonical_sha_file; check_pins_fresh asks the same binary).
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"

_WALK_UP = 8                      # records::walkUpDepth


def _strip_comments(txt):
    txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)
    return re.sub(r'(?m)^\s*//.*$', '', txt)


def _block(txt, name):
    """The text of the first `name { ... }` block (balanced braces) or None."""
    m = re.search(r'(?m)^\s*' + re.escape(name) + r'\s*\{', txt)
    if not m:
        return None
    i, depth = m.end(), 1
    while i < len(txt) and depth:
        depth += {'{': 1, '}': -1}.get(txt[i], 0)
        i += 1
    return txt[m.end():i - 1]


_PAIR = re.compile(r'"([^"]+)"\s+"?([0-9a-f]{64}|absent|relevant:[0-9a-f]{64})"?\s*;')


def read_manifest(path):
    """-> dict(sealed=bool, pins={sub: hash}, held={sub: hash}, records=set(sub)).

    A manifest that is absent returns all-empty.  `records` is the sealed
    form's keys (a `"<sub>" { ... }` block); `pins`/`held` are the scalar form.
    """
    out = dict(sealed=False, pins={}, held={}, records=set(), has_pins=False)
    p = Path(path)
    if not p.is_file():
        return out
    txt = _strip_comments(p.read_text(errors="replace"))
    out["sealed"] = bool(re.search(r'\bsealed\s+true\s*;', txt))
    for name in ("pins", "held"):
        b = _block(txt, name)
        if name == "pins":
            out["has_pins"] = b is not None      # an EMPTY `pins {}` is a referencing case too
        if b:
            out[name] = {k: v for k, v in _PAIR.findall(b)}
    rec = _block(txt, "records")
    if rec:
        out["records"] = set(re.findall(r'"([^"]+)"\s*\{', rec))
    return out


def manifest_of(case):
    """The nearest constant/propertyManifest walking up from `case`."""
    p = Path(case).resolve()
    for _ in range(_WALK_UP):
        m = p / "constant" / "propertyManifest"
        if m.is_file():
            return m
        if p.parent == p:
            break
        p = p.parent
    return None


def local_record(case, sub):
    """Nearest case-local constant/<sub> walking up from `case`, else None."""
    p = Path(case).resolve()
    for _ in range(_WALK_UP):
        c = p / "constant" / sub
        if c.exists():
            return c
        if p.parent == p:
            break
        p = p.parent
    return None


def record_path(case, sub, std=None):
    """The record file the engine reads for `sub` in `case`: the case's own
    constant/<sub>, else the catalogue's (`std` overrides the catalogue root,
    for a probe on a relocated tree).  A sealed case never falls back to the
    catalogue: the path is returned only if the case carries it, else None."""
    loc = local_record(case, sub)
    if loc is not None:
        return loc
    m = manifest_of(case)
    if m is not None and read_manifest(m)["sealed"]:
        return None
    root = Path(std) if std else STD
    cat = root / sub
    if cat.exists():
        return cat
    #  A component components/ does not hold is read from a gas-species table
    #  the case DECLARES (`speciesTables ( ... );`, Database.cpp; DEV.md 4c
    #  C458: the radicals live there since 2026-11-21) -- the engine's own
    #  order, case > components > table.
    if sub.startswith("components/"):
        for t in declared_species_tables(case):
            cand = root / "thermoTables" / t / sub[len("components/"):]
            if cand.exists():
                return cand
    return None


def declared_species_tables(case):
    """The gas-species tables `case`'s constant/thermoPhysPropDict declares
    (`speciesTables ( A B );`), in declared order; [] when none."""
    p = Path(case) / "constant" / "thermoPhysPropDict"
    if not p.is_file():
        return []
    txt = re.sub(r"//[^\n]*", "", p.read_text(errors="replace"))
    mm = re.search(r"(?m)^\s*speciesTables\s*\(([^)]*)\)\s*;", txt)
    return mm.group(1).split() if mm else []


def copy_constant(case, dest):
    """Copy the case's constant/ to `dest`/constant for a probe case; a
    manifest that holds `pins` is dropped (the probe runs from the catalogue
    under CHOUPO_HOME, which is what the pinned case does anyway)."""
    src = Path(case) / "constant"
    dst = Path(dest) / "constant"
    shutil.copytree(src, dst)
    m = dst / "propertyManifest"
    if m.is_file() and read_manifest(m)["has_pins"]:
        m.unlink()
    return dst


def materialise(dst):
    """A COPY of a case that references the catalogue, made self-sufficient for a probe: every
    pinned record the copy does not carry is copied in from the catalogue (the copy then holds
    what the sealed case it replaced held).  The manifest is left for the probe to keep, edit or
    drop.  `dst` is a case directory or a `constant/` directory."""
    dst = Path(dst)
    const = dst if (dst / "propertyManifest").exists() or dst.name == "constant" else dst / "constant"
    man = const / "propertyManifest"
    if not man.is_file():
        return
    for sub, val in read_manifest(man)["pins"].items():
        if sub.endswith("/") or val.startswith("relevant:") or val == "absent":
            continue
        tgt = const / sub
        if not tgt.exists() and (STD / sub).is_file():
            tgt.parent.mkdir(parents=True, exist_ok=True)
            #  A copy of a catalogue record is a local homonym, and an undeclared homonym is
            #  REFUSED (the silent backfill closed, 2026-11-18): the probe's copy declares
            #  itself a full record read alone, which is exactly what it is.
            tgt.write_text(as_variation(tgt.stem, (STD / sub).read_text(), "gate probe copy of the catalogue record"))


def copytree(src, dst, *args, **kw):
    """shutil.copytree for a probe: the copy is materialised (see materialise())."""
    out = shutil.copytree(src, dst, *args, **kw)
    materialise(dst)
    return out


def as_variation(name, text, why="gate probe: a full record read alone"):
    """A probe's full local copy of a catalogue record, DECLARED (`variationOf`): an undeclared
    homonym is refused (the silent backfill closed, 2026-11-18), and a variation is read ALONE,
    so a line the probe deletes is truly absent -- no longer supplied again by the catalogue."""
    if re.search(r"(?m)^\s*(overlayOf|variationOf|distinctFrom)\b", text):
        return text                      # already declares what it is (a record copied from a case)
    return 'variationOf %s;\nvariationReason "%s";\n' % (name, why) + text


def undeclare(text):
    """A record's text without its declaration lines, for a probe that writes its own (a copy made
    by materialise() already declares itself; declaring twice is refused by the dictionary reader)."""
    return re.sub(r'(?m)^(variationOf|overlayOf|distinctFrom)\s+\S+;[^\n]*\n|^variationReason\s[^\n]*\n', '', text)


def declare_homonyms(case_dir, why="gate probe: the copy of a sealed case, unsealed"):
    """Every local record under `case_dir` (any `constant/` of it, sectors included) whose name is a
    catalogue record's and that declares nothing, declared a `variationOf`: a probe that UNSEALS a
    sealed copy would otherwise leave undeclared homonyms, which are refused."""
    for f in sorted(Path(case_dir).rglob("*.dat")):
        parts = f.parts
        if "constant" not in parts:
            continue
        k = len(parts) - 1 - parts[::-1].index("constant")
        rel = "/".join(parts[k + 1:])
        if (STD / rel).is_file():
            txt = f.read_text()
            if "variationOf" not in txt and "overlayOf" not in txt and "distinctFrom" not in txt:
                def ident(s):
                    fm = re.search(r"(?m)^formula\s+([^;]+);", s)
                    ch = re.search(r"(?m)^charge\s+(-?\d+)\s*;", s)
                    return (fm.group(1).strip() if fm else None, int(ch.group(1)) if ch else 0)
                kind = "variationOf" if ident(txt) == ident((STD / rel).read_text()) else "distinctFrom"
                f.write_text('%s %s;\nvariationReason "%s";\n' % (kind, f.stem, why) + txt)


def copy_variation(src, dst, why="gate probe: a full record read alone"):
    """shutil.copy of a catalogue record into a probe case, DECLARED (see as_variation)."""
    dst = Path(dst)
    if dst.is_dir():
        dst = dst / Path(src).name
    dst.write_text(as_variation(dst.stem, Path(src).read_text(), why))


def unpin(case_copy):
    """A probe copy of a case that references the catalogue behaves as the UNSEALED
    case it is once its manifest is gone (reads the catalogue under CHOUPO_HOME)."""
    m = Path(case_copy) / "constant" / "propertyManifest"
    if m.is_file() and read_manifest(m)["has_pins"]:
        m.unlink()


def ensure_local(case_copy, sub):
    """Put the record `sub` (standards-relative) in the copy's own constant/ when the
    copy does not carry it (it reads it from the catalogue): for a probe that edits it."""
    dst = Path(case_copy) / "constant" / sub
    if not dst.exists():
        src = STD / sub
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, dst)        # PLAIN: every caller declares the record itself, after its edit
    return dst


def manifests(root=None):
    """Every constant/propertyManifest under tutorials/ and data/curation/."""
    root = Path(root) if root else ROOT
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        import curation_roots
        roots = list(curation_roots.case_roots(root))
    except Exception:
        roots = [root / "tutorials"]
    for r in roots:
        yield from sorted(r.rglob("constant/propertyManifest"))


def pinned_case_dirs(root=None):
    root = Path(root) if root else ROOT
    for m in manifests(root):
        if read_manifest(m)["has_pins"]:
            yield m.parent.parent


def cases_pinning(root, sub):
    """Case directories (relative to root) whose manifest pins `sub` by name, or
    pins the registry directory `sub` lives in (a `relevant:` set line) AND names
    both components of a pair-shaped `sub` (A-B.dat) in its dicts: an arrival of a
    relevant pair reaches the case, an unrelated edit does not."""
    root = Path(root)
    out = []
    parent = sub.rsplit("/", 1)[0] + "/" if "/" in sub else None
    toks = None
    stem = sub.rsplit("/", 1)[-1][:-4] if sub.endswith(".dat") else None
    if stem and "-" in stem:
        toks = [stem[:k] for k in range(len(stem)) if stem[k] == "-"]
        toks = [(stem[:k], stem[k + 1:]) for k in range(len(stem)) if stem[k] == "-"]
    for m in manifests(root):
        mf = read_manifest(m)
        hit = sub in mf["pins"]
        if not hit and parent and mf["pins"].get(parent, "").startswith("relevant:") and toks:
            case = m.parent.parent
            text = ""
            for f in [case / "constant" / "thermoPhysPropDict", *sorted((case / "system").glob("*"))]:
                if f.is_file():
                    text += f.read_text(errors="replace")
            words = set(re.findall(r"[A-Za-z0-9_]+", text))
            hit = any(a in words and b in words for a, b in toks)
        if hit:
            out.append(str(m.parent.parent.relative_to(root)))
    return sorted(out)


if __name__ == "__main__":
    if len(sys.argv) == 3:
        r = record_path(sys.argv[1], sys.argv[2])
        print(r if r else "")
        sys.exit(0 if r else 1)
    print(__doc__)
