#!/usr/bin/env python3
"""check_lesson_symbols -- every symbol in an EduTool formula is DEFINED.

WHY THIS EXISTS.  The owner read the EduTools and asked whether a student
would know what the symbols in the equations mean.  Measured, on the day the
question was asked: 133 symbol uses across sixteen lesson modules where the
LETTER never appears outside a formula.  Some of those are harmless -- the
Kremser lesson writes `Y = y/(1-y)` and says in words what a mole ratio is, so
the letter is bound even though a text search cannot see it -- and some are
not: `eps d(c_i)/dt + rho_b d(q_i)/dt` opens the breakthrough lesson and the
words "porosity" and "bulk density" appear nowhere in that file.

WHAT THIS GATE CHECKS, and it is deliberately narrow: that every symbol a
`formula` uses appears in the `where` list of that step or an earlier one.
The `where` field (methods/lessonStep.tsx) is a list of {sym, means, unit},
drawn under the equation the way a textbook does it.

WHAT IT CANNOT CHECK, and saying so is the point of the sentence:
  * whether a definition is CORRECT.  "X  the reflux ratio" in the drying
    lesson would pass here and be nonsense on the page.
  * whether it is USEFUL.  "R  the R in the equation" passes.
  * whether the symbol needed defining at all.  A chemical formula in a
    reaction (CO2, HCO3) is filtered out by shape, not by judgement, and the
    filter will occasionally be wrong in both directions.
A gate that implied more than this would be worse than none: three of the
twelve gates this project shipped in one day state coverage they do NOT have
for exactly that reason.

THE DEBT.  The `where` field arrived empty everywhere.  Filling it is real
writing and a WRONG definition is worse than a missing one -- a gap is
visible and a falsehood is not -- so the lessons that are not yet glossed are
NAMED in debt_registry.LESSON_SYMBOLS_UNGLOSSED.  A pinned lesson may not
grow new unglossed symbols; an unpinned one must have none.  A pin that no
longer fires is removed, or it becomes a licence.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from debt_registry import LESSON_SYMBOLS_UNGLOSSED          # noqa: E402

ROOT = HERE.parent.parent
LESSONS = ROOT / "gui" / "src" / "ui" / "methods"

GREEK = "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ"

#  A CHEMICAL FORMULA IS NOT A SYMBOL TO DEFINE.  A student reading a
#  carbonate diagram is not owed a definition of CO2, and glossing them would
#  bury the symbols that DO need it.  Matched by shape (capital, optional
#  lower case, optional digits, repeated) rather than by a list, because a
#  list would need editing every time a lesson meets a new substance.
#  A chemical formula needs at least two characters AND either a digit or a
#  lower-case letter: CO2, HCO3, NaOH, Na2CO3.  A BARE CAPITAL IS A VARIABLE,
#  not a substance, and getting this wrong the first time made the gate pass
#  over its own subject -- `X`, `Y`, `R`, `A`, `N`, `L`, `V` all matched the
#  first version of this pattern and were skipped, which is every symbol that
#  collides across unit operations.  A single capital that really does mean an
#  element (carbon in a formula) is over-reported and glossed, which is the
#  safe direction: this filter may cost a curator one line, never a student a
#  definition.
CHEM = re.compile(r'^(?=.{2,})(?:[A-Z][a-z]?\d*){1,}(?:aq)?$')

#  English words that survive the symbol filter because they are short.
WORDS = {
    "and", "or", "the", "of", "to", "in", "at", "is", "a", "an", "for", "by",
    "with", "per", "from", "on", "if", "then", "exp", "ln", "log", "min",
    "max", "sum", "both", "one", "two", "out", "line", "same", "that",
    "there", "so", "as", "be", "are", "not", "only", "when", "where", "d",
    "no", "all", "any", "its", "it", "we", "up", "low", "high", "s", "kg",
    "kW", "mol", "kJ", "K", "Pa", "bar", "m", "s", "h", "eq", "vs",
}


def js_strings(js: str) -> str:
    """Concatenated JS string literals -> one text."""
    return "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', js)).replace("\\n", "\n")


def field(block: str, name: str) -> str:
    m = re.search(name + r':\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)', block)
    return js_strings(m.group(1)) if m else ""


def glossed(block: str) -> set:
    """The symbols this step's `where` list defines."""
    m = re.search(r'where:\s*\[(.*?)\]\s*,\s*\n\s*(?:note|formula|\})',
                  block, re.S)
    if not m:
        return set()
    #  A `sym` may legitimately cover a PAIR -- "C_hot / C_cold",
    #  "T_h,in / T_c,in" -- because the two are one idea and splitting them
    #  into two entries makes the reader read the same sentence twice.  The
    #  entry defines both, so both count as glossed.  Split on / and on a
    #  comma that separates two symbol-shaped tokens, never inside one
    #  (T_h,in is ONE symbol).
    out = set()
    for raw in re.findall(r'sym:\s*"((?:[^"\\]|\\.)*)"', m.group(1)):
        out.add(raw)
        #  Split on `/` and on a COMMA FOLLOWED BY A SPACE.  The space is
        #  what tells the two apart: "T_h,in" is ONE symbol with a qualifier
        #  inside it, while "b_j, p_j" is two symbols listed together.  A
        #  bare comma must not split, or every subscripted end-point symbol
        #  would be cut in half.
        for part in re.split(r'\s*/\s*|,\s+', raw):
            part = part.strip()
            if part:
                out.add(part)
                #  "T_h,in" also glosses "T_h": the qualifier after the comma
                #  names WHICH end, and a formula that writes the bare symbol
                #  is asking about the same quantity.
                out.add(part.split(",")[0].strip())
    return out


def is_symbol(tok: str) -> bool:
    """Looks like a variable rather than a word."""
    if tok in WORDS or tok.lower() in WORDS:
        return False
    if len(tok) > 9:
        return False
    if "_" in tok:
        return True
    if any(c in GREEK for c in tok):
        return True
    if len(tok) <= 3 and any(c.isupper() for c in tok):
        return not CHEM.match(tok) or len(tok) <= 2
    return False


def steps(src: str):
    idx = [m.start() for m in re.finditer(r'^\s*n:\s*\d+,\s*$', src, re.M)]
    idx.append(len(src))
    return [src[idx[i]:idx[i + 1]] for i in range(len(idx) - 1)]


def audit(path: Path):
    src = path.read_text(encoding="utf-8")
    seen_gloss, missing = set(), []
    for block in steps(src):
        seen_gloss |= glossed(block)
        #  THE DERIVATION'S EQUATIONS COUNT TOO.  The `derivation` field
        #  arrived on 2026-08-31 under the textbook ruling, and it carries
        #  `eq:` lines that are formulas in every sense a student cares
        #  about -- the McCabe derivation introduces F and z_F, which its
        #  step's `where` list did not have.  Reading only `formula` would
        #  have let a whole new surface of equations past this gate while
        #  the suite stayed green, which is the shape this gate exists to
        #  catch one level down.
        formula = field(block, "formula")
        for eq in re.findall(r'eq:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)',
                             block):
            formula += "\n" + js_strings(eq)
        if not formula.strip():
            continue
        #  A BRACED SUBSCRIPT IS PART OF THE SYMBOL.  `y_{n+1}` used to
        #  tokenise as `y_`, and the only ways to satisfy the gate were to
        #  gloss a token that is not a symbol or to stop writing the
        #  subscript -- gaming the check, or damaging the notation to please
        #  it.  Both are worse than the gap.  A trailing `_{...}` is now
        #  taken with the letter it belongs to.
        for tok in re.findall(
                r'[A-Za-z' + GREEK + r'][A-Za-z0-9_' + GREEK
                + r']*(?:\{[^}]*\})?', formula):
            if not is_symbol(tok) or CHEM.match(tok):
                continue
            if tok not in seen_gloss and tok not in missing:
                missing.append(tok)
    return missing


def main() -> int:
    #  COVERAGE FOLLOWS THE ABSTRACTION, NOT THE FILENAME.  This globbed
    #  `*Lesson.ts` only, so a page carrying LessonStep steps inside a
    #  `*Tool.tsx` -- with formulas and glosses, rendered by the same
    #  LessonStepView -- was invisible, and the OK line's "N of N lesson
    #  modules" read as full coverage while being narrower than any reader
    #  would assume.  Found the day PonchonSavaritTool.tsx became the first
    #  such page; measured before wiring, and it was the only one, so this
    #  widening moved nothing else.
    lessons = sorted(LESSONS.glob("*Lesson.ts"))
    lessons += sorted(f for f in LESSONS.glob("*Tool.tsx")
                      if "LessonStep" in f.read_text(encoding="utf-8"))
    if not lessons:
        print("check_lesson_symbols: FAILED\n  no lesson module found at "
              f"{LESSONS} -- this gate cannot run, and a check that cannot "
              "run must not pass.")
        return 1

    problems, pinned_clean, total_missing = [], [], 0
    for f in lessons:
        miss = audit(f)
        total_missing += len(miss)
        pinned = f.name in LESSON_SYMBOLS_UNGLOSSED
        if miss and not pinned:
            problems.append(
                f"  {f.name}: {len(miss)} formula symbol(s) with no `where` "
                f"entry: {', '.join(miss)}")
        if not miss and pinned:
            pinned_clean.append(f.name)

    if problems:
        print("check_lesson_symbols: FAILED")
        for p in problems:
            print(p)
        print("  REMEDY: add a `where: [{ sym, means, unit }]` list to the "
              "step whose formula uses them -- it renders under the equation. "
              " A lesson that is not ready to be glossed is NAMED in "
              "debt_registry.LESSON_SYMBOLS_UNGLOSSED with its reason.")
        return 1

    if pinned_clean:
        print("check_lesson_symbols: FAILED")
        print("  glossed, but still pinned as unglossed: "
              + ", ".join(pinned_clean) + ".")
        print("  Remove them from debt_registry.LESSON_SYMBOLS_UNGLOSSED -- "
              "a pin that no longer fires is a licence.")
        return 1

    done = len(lessons) - len(LESSON_SYMBOLS_UNGLOSSED)
    print(
        f"check_lesson_symbols: OK -- {done} of {len(lessons)} lesson "
        f"module(s) gloss every symbol their formulas use; "
        f"{len(LESSON_SYMBOLS_UNGLOSSED)} are NAMED as unglossed in the debt "
        f"registry ({total_missing} symbol(s) outstanding across them) and "
        f"none may grow a new one.  WHAT THIS DOES NOT CHECK, and it is the "
        f"half that matters: whether a definition is CORRECT, whether it is "
        f"useful, or whether the symbol needed one -- 'X  the reflux ratio' "
        f"in the drying lesson would pass here and be nonsense on the page.  "
        f"Chemical formulas are filtered out by SHAPE, so the filter is "
        f"occasionally wrong in both directions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
