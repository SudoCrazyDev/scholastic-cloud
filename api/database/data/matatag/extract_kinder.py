"""
Extract DepEd's Kindergarten catalog from the Kinder e-class record.

    python extract_kinder.py "UPDATED [Kinder] E-Class Record with SF9.xlsx" \
        --code deped-kindergarten-v1 -o kindergarten.v1.json

Writes the catalog JSON the loader reads, a `.cells.json` beside it saying
where each slot lives on the workbook's own sheets, and prints a report. Only
ever reads the workbook.

## Why this is not extract.py

The Grade 1 workbook encodes which slots exist *only* as cell fill colour, and
extract.py is built around decoding that. The Kinder workbook has nothing of
the kind: every one of its 60 competencies is rated once in every term, on the
same three-letter scale, so there is no palette to decode and no pacing to
discover. What it does have is a different source of truth for the tree, so a
separate, much smaller script reads it honestly rather than bending the Grade 1
one around it.

## Where each fact comes from

- `SF9 - KINDER` is the tree: the four developmental domains (the learning
  areas here), Language's lettered sub-domains, and the competency wording.
  Each competency row carries a VLOOKUP whose column index says exactly which
  column of the class-summary sheets holds its rating.
- `TERM {1,2,3} SUMMARY` rows 12-14 number every rating column. The extractor
  reads each term's sheet on its own and asserts that the column SF9 points at
  carries the competency's own number there. Two independent signals agreeing
  is the check; nothing is carried between sheets.

The header *tooltips* on the class-summary sheets are not used. Cognitive
Development's twenty columns all carry the first two competencies' prompts,
copied across — see the anomalies report.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.utils import column_index_from_string, get_column_letter

SF9 = "SF9 - KINDER"
TERM_SHEETS = {1: "TERM 1 SUMMARY", 2: "TERM 2 SUMMARY", 3: "TERM 3 SUMMARY"}

# Both columns of the SF9 competency table: (text column, T1 rating column).
SF9_COLUMNS = [("D", "H"), ("L", "O")]
SF9_ROWS = range(26, 70)

# VLOOKUP ranges start at column C, so index n is column C + n - 1.
VLOOKUP_BASE = column_index_from_string("C")

# The first learner row of each block on the class-summary sheets.
MALE_FIRST_ROW = 16
FEMALE_FIRST_ROW = 66

AREA_RE = re.compile(r"^(I|II|III|IV|V|VI)\.\s+(.+)$")
DOMAIN_RE = re.compile(r"^([A-Z])\.\s+(.+)$")
COMPETENCY_RE = re.compile(r"^(\d+)\.\s+(.+)$", re.S)
VLOOKUP_RE = re.compile(r"VLOOKUP\(\$E\$18,'(TERM \d SUMMARY)'!\$C\$16:\$B[TU]\$114,(\d+),")

anomalies: list[str] = []


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def clean(text: str) -> str:
    # The workbook's apostrophes arrive mis-encoded as U+FFFD.
    return text.replace("�", "’").strip()


def competency_text(raw: str) -> str:
    """
    One line of competency text.

    Two shapes of line break appear: a wrapped phrase ("Describes objects based
    on attributes / (shape, color, taste, texture)"), which joins with a space,
    and a lettered list under a stem ("Orally segment sounds / a. syllable /
    b. onset and rime"), which keeps its letters.
    """
    lines = [clean(line) for line in raw.split("\n") if line.strip()]
    stem, rest = lines[0], lines[1:]

    if rest and all(re.match(r"^[a-z]\.\s", line) for line in rest):
        return f"{stem.rstrip(':')}: " + "; ".join(rest)

    return re.sub(r"\s+", " ", " ".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook")
    parser.add_argument("--code", default="deped-kindergarten-v1")
    parser.add_argument("-o", "--output", default="kindergarten.v1.json")
    args = parser.parse_args()

    wb = openpyxl.load_workbook(args.workbook)
    sf9 = wb[SF9]

    areas: list[dict] = []
    area = None
    domain = None
    pending_parent_domain = None

    for text_col, rating_col in SF9_COLUMNS:
        for row in SF9_ROWS:
            value = sf9[f"{text_col}{row}"].value
            if not isinstance(value, str) or not value.strip():
                continue
            text = value.strip()
            formula = sf9[f"{rating_col}{row}"].value

            if m := AREA_RE.match(text):
                area = {
                    "key": slug(m.group(2).replace("Development", "")),
                    "title": f"{m.group(1)}. {clean(m.group(2))}",
                    "shape": "year_list",
                    "uses_macro_skills": False,
                    "has_domains": False,
                    "carries_values": False,
                    "sort_order": len(areas) + 1,
                    "domains": [],
                    "competencies": [],
                }
                areas.append(area)
                domain = pending_parent_domain = None
                continue

            if area is None:
                continue

            if isinstance(formula, str) and (m := COMPETENCY_RE.match(text)):
                number = m.group(1)
                lookup = VLOOKUP_RE.search(formula)
                if not lookup:
                    raise SystemExit(f"{SF9}!{rating_col}{row}: no VLOOKUP in {formula!r}")
                if lookup.group(1) != "TERM 1 SUMMARY":
                    anomalies.append(
                        f"{SF9}!{rating_col}{row}: the Term 1 rating for competency {number} "
                        f"reads '{lookup.group(1)}' — DepEd's formula bug; the column index "
                        "is used and the sheet name is not."
                    )
                area["competencies"].append({
                    "path": f".{number}",
                    "number": number,
                    "letter": None,
                    "label": number,
                    "text": competency_text(m.group(2)),
                    "term": 0,
                    "domain": domain["code"] if domain else None,
                    "is_rateable": True,
                    "sort_order": len(area["competencies"]) + 1,
                    "slots": [{"term": t, "macro_skill": "none", "sort_order": 1} for t in (1, 2, 3)],
                    "_column": get_column_letter(VLOOKUP_BASE + int(lookup.group(2)) - 1),
                })
                continue

            # A heading. Lettered ("D. Reading") is a sub-domain; unlettered
            # ("Letter Knowledge") is a band under the lettered one above it,
            # and becomes its own domain titled with both.
            if m := DOMAIN_RE.match(text):
                pending_parent_domain = clean(text)
                domain = {"code": slug(text), "title": pending_parent_domain, "term": 0}
                area["domains"].append(domain)
            elif pending_parent_domain:
                if domain and domain["title"] == pending_parent_domain and not any(
                    c["domain"] == domain["code"] for c in area["competencies"]
                ):
                    # The lettered heading held no competency of its own before
                    # its first band, so it is a band title, not a domain.
                    area["domains"].remove(domain)
                title = f"{pending_parent_domain} — {clean(text)}"
                domain = {"code": slug(title), "title": title, "term": 0}
                area["domains"].append(domain)
            else:
                anomalies.append(f"{SF9}!{text_col}{row}: unrecognised heading {text!r} — skipped.")

    # ---- cross-check each competency's column against every term's headings
    # The cell map has Grade 1's shape (grade-1.v1.cells.json): per area, the
    # first learner row and `path|term|macro_skill` => [sheet, column index].
    cells = {}
    for a in areas:
        slots = cells.setdefault(a["key"], {"learner_row": MALE_FIRST_ROW, "slots": {}})["slots"]
        a["has_domains"] = bool(a["domains"])
        for i, d in enumerate(a["domains"], start=1):
            d["sort_order"] = i
        for c in a["competencies"]:
            column = c.pop("_column")
            for term, sheet_name in TERM_SHEETS.items():
                ws = wb[sheet_name]
                heading = next(
                    (ws[f"{column}{r}"].value for r in (14, 13, 12)
                     if isinstance(ws[f"{column}{r}"].value, (int, float))),
                    None,
                )
                if heading is None or int(heading) != int(c["number"]):
                    raise SystemExit(
                        f"{sheet_name}!{column}12:14 is numbered {heading!r}, but SF9 puts "
                        f"{a['key']} competency {c['number']} there. The layouts disagree; "
                        "resolve by hand before loading anything."
                    )
                slots[f"{c['path']}|{term}|none"] = [sheet_name, column_index_from_string(column)]
        a["counts"] = {
            "competencies": len(a["competencies"]),
            "slots": sum(len(c["slots"]) for c in a["competencies"]),
        }

    # ---- the rating scale the sheets actually accept
    for sheet_name in TERM_SHEETS.values():
        for dv in wb[sheet_name].data_validations.dataValidation:
            if dv.formula1 and "CO" in dv.formula1 and dv.formula1 != '"CO,DV,BG"':
                anomalies.append(
                    f"{sheet_name} {dv.sqref}: a rating dropdown offers {dv.formula1}, not "
                    '"CO,DV,BG" — DepEd\'s typo; the SF9 legend and every other dropdown say BG.'
                )
    anomalies.append(
        "TERM n SUMMARY header tooltips: Cognitive Development's columns repeat competencies 1 "
        "and 2's prompts across all twenty — not used; SF9's wording is."
    )

    payload = {
        "version": {
            "code": args.code,
            "title": "DepEd Kindergarten Progress Report",
            "grade_level": "Kindergarten",
            "instrument": "kinder",
            "source": Path(args.workbook).name,
            "published_on": None,
        },
        "counts": {
            "competencies": sum(a["counts"]["competencies"] for a in areas),
            "slots": sum(a["counts"]["slots"] for a in areas),
        },
        "learning_areas": areas,
    }

    out = Path(args.output)
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    # Written for a Kindergarten .xlsx export, which is not built yet: the
    # addresses come from the same run as the catalog so they cannot drift.
    # The female block starts FEMALE_FIRST_ROW - MALE_FIRST_ROW rows lower.
    cell_map = {
        "template": Path(args.workbook).name,
        "version_code": args.code,
        "female_offset": FEMALE_FIRST_ROW - MALE_FIRST_ROW,
        "areas": cells,
    }
    out.with_name(out.name.removesuffix(".json") + ".cells.json").write_text(
        json.dumps(cell_map, indent=1) + "\n", encoding="utf-8"
    )

    print(f"{args.code}: {payload['counts']['competencies']} competencies, "
          f"{payload['counts']['slots']} slots")
    for a in areas:
        print(f"  {a['title']}: {a['counts']['competencies']} competencies, "
              f"{len(a['domains'])} domains")
        for d in a["domains"]:
            n = sum(1 for c in a["competencies"] if c["domain"] == d["code"])
            print(f"      {d['title']}: {n}")
    print(f"anomalies ({len(anomalies)}):")
    for line in anomalies:
        print(f"  - {line}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
