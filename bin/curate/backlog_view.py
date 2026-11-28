#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""backlog_view: render BACKLOG.tsv as one self-contained HTML page, in priority order.

A VIEW of the backlog (DEV.md 4c C436), never a second home: every number and
word on the page is read from BACKLOG.tsv at render time.  The page shows the
items in progress (rank 0), then the open and partial items by rank, each with
its size, its reason for that place and what is missing; closed items are
counted, not listed.

    bin/curate/backlog_view.py OUT.html     (a page)
    bin/curate/backlog_view.py OUT.md       (a Markdown table, for a side panel)
    bin/curate/backlog_view.py OUT.json     (the page's meta/ranks document, stamped)

Every view carries the time it was made (Vitor, 2026-11-18: "no topo põe a
data e hora para eu não estar sempre a perguntar").
"""
import csv, html, json, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOTS = ("BACKLOG.tsv",)
SIZE = {"S": ("horas", "#2f6b4f"), "M": ("um dia", "#9a5b00"), "L": ("vários dias", "#a3332b")}


def day_balance(rows, today):
    """Items closed and opened today, against BACKLOG.tsv as it stood at the
    last commit before today began (Vitor, 2026-11-18: the backlog must show
    whether each day closes more than it opens)."""
    base = subprocess.run(["git", "-C", str(ROOT), "rev-list", "-1", "--before", today + " 00:00",
                           "HEAD", "--", "BACKLOG.tsv"], capture_output=True, text=True).stdout.strip()
    if not base:
        return "hoje: sem registo anterior"
    old = subprocess.run(["git", "-C", str(ROOT), "show", base + ":BACKLOG.tsv"],
                         capture_output=True, text=True).stdout.splitlines()
    before = {r["item"]: r["status"] for r in csv.DictReader(old, delimiter="\t")}
    live = ("OPEN", "PARTIAL")
    # an item opened and closed the same day counts on both sides
    closed = sum(1 for r in rows if r["status"] not in live and
                 (before.get(r["item"]) in live or (r["item"] not in before and r["status"] == "DONE")))
    opened = sum(1 for r in rows if (r["item"] not in before and r["status"] in live + ("DONE",)) or
                 (r["status"] in live and r["item"] in before and before[r["item"]] not in live))
    return f"hoje: {closed} fechados, {opened} abertos"


def week_closed(rows, today):
    """Items closed in the last seven days: the number Vitor watches go UP
    (2026-11-22: "uma backlog que nao me deixe ansioso")."""
    base = subprocess.run(["git", "-C", str(ROOT), "rev-list", "-1", "--before=7.days",
                           "HEAD", "--", "BACKLOG.tsv"], capture_output=True, text=True).stdout.strip()
    if not base:   # the file is younger than a week: count from its first version
        base = subprocess.run(["git", "-C", str(ROOT), "log", "--diff-filter=A", "--format=%H",
                               "--", "BACKLOG.tsv"], capture_output=True, text=True).stdout.split()[-1:]
        base = base[0] if base else ""
    if not base:
        return 0
    old = subprocess.run(["git", "-C", str(ROOT), "show", base + ":BACKLOG.tsv"],
                         capture_output=True, text=True).stdout.splitlines()
    before = {r["item"]: r["status"] for r in csv.DictReader(old, delimiter="\t")}
    return sum(1 for r in rows if r["status"] == "DONE" and before.get(r["item"]) != "DONE")


def themes():
    t = {}
    f = ROOT / "bin" / "curate" / "backlog_themes.tsv"
    if f.exists():
        for line in f.read_text().splitlines():
            if line and not line.startswith("#") and "\t" in line:
                k, v = line.split("\t", 1)
                t[k.strip()] = v.strip()
    return t



def progress():
    """item -> [percent, basis], the architect's estimate (bin/curate/backlog_progress.tsv);
    an item with no line shows no percentage, never a zero."""
    t = {}
    f = ROOT / "bin" / "curate" / "backlog_progress.tsv"
    if f.exists():
        for line in f.read_text().splitlines():
            if line and not line.startswith("#"):
                k, pct, why = line.split("\t", 2)
                t[k] = [int(pct), why]
    return t


THEME_ORDER = ["Para 2 de dezembro", "Cinética e reatores", "Termodinâmica e propriedades", "Colunas e separação",
               "Planta, layout e economia", "EduTools e aplicação", "Núcleo e manutenção", "Outros"]


def main():
    if len(sys.argv) != 2:
        print(__doc__); return 2
    rows = list(csv.DictReader((ROOT / "BACKLOG.tsv").open(), delimiter="\t"))
    open_ = [r for r in rows if r["status"] in ("OPEN", "PARTIAL")]
    open_.sort(key=lambda r: (int(r["rank"]), int(r["item"][1:])))
    count = {s: sum(1 for r in rows if r["status"] == s) for s in ("DONE", "PARTIAL", "OPEN", "DROPPED", "ROADMAP")}
    th = themes()
    pg = progress()
    week = week_closed(rows, datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d"))
    e = html.escape
    now = datetime.now(timezone.utc)
    stamp = now.astimezone().strftime("%d/%m/%Y %H:%M")
    day = day_balance(rows, now.astimezone().strftime("%Y-%m-%d"))
    if sys.argv[1].endswith(".json"):
        doc = {"ranks": {r["item"]: [r["rank"], r["why_pt"]] for r in open_},
               "themes": {r["item"]: th.get(r["item"], "Outros") for r in open_},
               "themeOrder": THEME_ORDER, "progress": {r["item"]: pg[r["item"]] for r in open_ if r["item"] in pg},
               "week": week, "roadmap": count["ROADMAP"],
               "from": "BACKLOG.tsv", "updated": now.isoformat(timespec="seconds"), "day": day}
        Path(sys.argv[1]).write_text(json.dumps(doc, ensure_ascii=False))
        print(f"backlog_view: wrote {sys.argv[1]} (stamped {stamp})")
        return 0

    def row(r):
        sz, col = SIZE.get(r["size"], ("?", "#5d6a62"))
        rank = "▶" if r["rank"] == "0" else r["rank"]
        st = "parcial" if r["status"] == "PARTIAL" else "aberto"
        return (f'<tr><td class="k">{rank}</td><td><b>{e(r["item"])}</b> {e(r["title_pt"])}'
                f'<div class="y">{e(r["why_pt"])}</div>'
                + (f'<div class="n">Falta: {e(r["open_pt"])}</div>' if r["open_pt"] else "")
                + f'</td><td><span class="p" style="color:{col}">{sz}</span><br><span class="s">{st}'
                + (f' ≈ {pg[r["item"]][0]} %' if r["item"] in pg else "") + '</span></td></tr>')

    now = [r for r in open_ if r["rank"] == "0"]
    nxt = [r for r in open_ if 1 <= int(r["rank"]) <= 15]
    later = [r for r in open_ if int(r["rank"]) > 15]

    def table(title, lst):
        return (f"<h2>{title} <small>{len(lst)}</small></h2><table>"
                + "".join(row(r) for r in lst) + "</table>") if lst else ""

    if sys.argv[1].endswith(".md"):
        ico = {"S": "🟢", "M": "🟡", "L": "🔴"}
        def mdrow(r):
            return f"| {ico.get(r['size'], '')} | **{r['item']}** {r['title_pt'].strip(chr(34)).replace(chr(34)*2, chr(34))} | " \
                   + (f"{pg[r['item']][0]} %" if r["item"] in pg else "") + " |"
        nxt10 = [r for r in open_ if r["rank"] != "0"][:10]
        md = (f"# Backlog do Choupo\n\n**Atualizado: {stamp}**\n\n"
              f"**Fechados nos últimos 7 dias: {week}** · {day} · faltam {len(open_)} "
              f"(+ {count['ROADMAP']} programas de longo prazo no ROADMAP)\n"
              f"\n### ▶ A andar agora ({len(now)})\n\n| | Item | Feito |\n|---|---|---:|\n" + "\n".join(mdrow(r) for r in now) + "\n"
              f"\n### A seguir, por prioridade ({len(nxt10)})\n\n| | Item | Feito |\n|---|---|---:|\n" + "\n".join(mdrow(r) for r in nxt10) + "\n"
              f"\n### O resto, por tema\n")
        rest = [r for r in open_ if r["rank"] != "0" and r not in nxt10]
        for t in THEME_ORDER + ["Outros"]:
            lst = [r for r in rest if (th.get(r["item"], "Outros") if th.get(r["item"]) in THEME_ORDER else "Outros") == t]
            if lst:
                md += f"\n**{t}** ({len(lst)})\n\n| | Item | Feito |\n|---|---|---:|\n" + "\n".join(mdrow(r) for r in lst) + "\n"
        md += "\n🟢 horas · 🟡 um dia · 🔴 vários dias.  Feito: estimativa, partes no main.  Fonte: BACKLOG.tsv (o histórico de cada item no DEV.md 4c).\n"
        Path(sys.argv[1]).write_text(md)
        print(f"backlog_view: wrote {sys.argv[1]} ({len(open_)} open or partial items)")
        return 0

    page = f"""<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Backlog do Choupo</title>
<style>
body{{font:14px system-ui,sans-serif;margin:0;padding:12px;background:#f6f7f4;color:#1d2420}}
@media (prefers-color-scheme:dark){{body{{background:#131815;color:#e4ebe6}} .y{{color:#7cc4a0!important}} td{{border-color:#2c352f!important}}}}
h1{{font-size:18px;margin:0 0 4px}} h2{{font-size:15px;margin:16px 0 6px}} h2 small{{font-weight:400;opacity:.6}}
.c{{opacity:.75;font-size:12.5px}} table{{border-collapse:collapse;width:100%}}
td{{padding:6px 4px;border-bottom:1px solid #dde3dc;vertical-align:top}} td.k{{width:22px;font-weight:600;opacity:.7}}
.y{{color:#2f6b4f;font-size:12.5px}} .n{{opacity:.7;font-size:12.5px}} .p{{font-size:12px;font-weight:600;white-space:nowrap}} .s{{font-size:11.5px;opacity:.6}}
</style></head><body>
<h1>Backlog do Choupo</h1>
<div class="c"><b>Atualizado: {stamp}</b> · {day} · Por prioridade: o valor contra o tamanho. ▶ em curso. Feitos {count['DONE']} · parciais {count['PARTIAL']} · abertos {count['OPEN']} · largados {count['DROPPED']}. Fonte: BACKLOG.tsv.</div>
{table("Em curso", now)}{table("Próximo lote", nxt)}{table("Depois", later)}
</body></html>"""
    Path(sys.argv[1]).write_text(page)
    print(f"backlog_view: wrote {sys.argv[1]} ({len(open_)} open or partial items)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
