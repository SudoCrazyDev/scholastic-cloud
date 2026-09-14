#!/usr/bin/env python3
"""
Turn a DepEd MATATAG Key Stage 1 workbook into a catalog JSON the PHP loader
can read.

    python extract.py ../../../../docs/modules/MatatagKeyStage1/KEY_STAGE_1_GRADE_1_3_TERM.xlsx \
        --grade "Grade 1" --code deped-matatag-ks1-grade-1-v1 -o grade-1.v1.json

Run it again for Grade 2 and Grade 3 when their workbooks arrive. Read
`README.md` beside this file first, and `docs/modules/MatatagKeyStage1/MATATAG.md`
for why any of this is shaped the way it is.

## Where the structure comes from

Two sheets, used for two different things:

* **`PACE - GRADE 1`** gives the *competency tree* — the numbering, the lettered
  children, the domain bands, the wording, and (for GMRC) the performance
  standard. It also says which column of which class-summary sheet each
  competency's marks live in, via its VLOOKUP formulas.

* **The class-summary sheets** (`TERM n READING & LITERACY` and friends) say
  which slots actually *exist* in a given term, and whose they are. A slot
  exists iff its cell carries a macro-skill fill colour in that term's sheet
  — cells for a competency not taught that term are filled black or with a
  theme colour — and rows 12 and 13 above the cell name the competency it
  belongs to.

**Each class-summary sheet is read entirely on its own**, and nothing is
carried between them. That is not fussiness. The three term sheets do not share
a column layout: `TERM 3 LANGUAGE` is two columns wider than Terms 1 and 2,
because an extra child pair was inserted under competency 6. Taking a
competency's columns from the PACE formulas and looking those column numbers up
in each term's sheet — the obvious approach, and the one this script used
first — therefore reads a neighbour's cell from competency 6 onwards, and
does it silently, because where both children are assessed it lands on another
filled cell and the count still comes out right. It cost exactly one pair in
Grade 1: Language competency 8 is assessed on child b in Term 3 and was
credited to child a. Assume the next workbook has the same shape of defect.

The fills and headings are therefore authoritative and the PACE formulas are
used only for the competency tree and its wording. That also keeps DepEd's four
known formula bugs out of the catalog for free.

## Output

Writes JSON and prints a report. **The report is the point** — read it. It
lists per-area counts to check by hand against the PACE sheets, and an
`anomalies` section naming every row the parser had to make a judgement call
about. A silent run is not a successful run.
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import OrderedDict

try:
    import openpyxl
    from openpyxl.utils import get_column_letter
except ImportError:  # pragma: no cover
    sys.exit("openpyxl is required:  pip install openpyxl")


# ---------------------------------------------------------------------------
# The macro-skill palette.
#
# MUST match `macro_skills.*.fills` in api/config/matatag.php. The workbook
# encodes a slot's macro skill ONLY as its cell's background colour — there is
# a printed legend and no machine-readable label anywhere in the file.
#
# Anything not listed here means "not taught this term": DepEd fills those
# cells black (FF000000) or with a theme colour. If a future workbook uses
# shades we have not seen, the run will report them as UNKNOWN FILLS rather
# than dropping the slots quietly. Add them in both places.
# ---------------------------------------------------------------------------
MACRO_SKILL_FILLS = {
    "FFFDE49A": "listening",
    "FFFFE598": "listening",
    "FFC9A6E6": "speaking",
    "FFFFA766": "reading",
    "FFF7B083": "reading",
    "FFC4E0B3": "copying_guided_writing",
}
NO_MACRO_SKILL = "none"

VLOOKUP = re.compile(r"VLOOKUP\([^,]*,'([^']*)'!C\d+:[A-Z]+\d+,(\d+),0\)")
LETTERED = re.compile(r"^\s*([a-z])\s*[.)]\s+", re.IGNORECASE)
TERM_LABEL = re.compile(r"^\s*term\s+(\d+)\s*$", re.IGNORECASE)

# A block is one printed column-pair of the PACE form: where its numbers, its
# wording and its per-term rating cells sit. Reading & Literacy and Language
# print two side by side; the rest print one.
#   ratings: {pace column index -> term}, or {index -> None} when the term is
#            carried by a "Term N" band instead of by the column.
AREAS = [
    {
        "key": "reading-literacy",
        "title": "Reading and Literacy",
        "pace_rows": (18, 88),
        "sheets": {t: "TERM %d READING & LITERACY" % t for t in (1, 2, 3)},
        "learner_row": 15,
        "shape": "year_list",
        "uses_macro_skills": True,
        "has_domains": True,
        "carries_values": False,
        "blocks": [
            {"no": 3, "text": 4, "ratings": {7: 1, 8: 2, 9: 3}},
            {"no": 11, "text": 12, "ratings": {16: 1, 17: 2, 18: 3}},
        ],
    },
    {
        "key": "language",
        "title": "Language",
        "pace_rows": (98, 165),
        "sheets": {t: "TERM %d LANGUAGE" % t for t in (1, 2, 3)},
        "learner_row": 15,
        "shape": "year_list",
        "uses_macro_skills": True,
        "has_domains": True,
        "carries_values": False,
        "blocks": [
            {"no": 3, "text": 4, "ratings": {7: 1, 8: 2, 9: 3}},
            {"no": 11, "text": 12, "ratings": {16: 1, 17: 2, 18: 3}},
        ],
    },
    {
        "key": "mathematics",
        "title": "Mathematics",
        "pace_rows": (174, 247),
        "sheets": {0: "TERM 1-3 MATHEMATICS"},
        "learner_row": 16,
        "shape": "per_term_list",
        "uses_macro_skills": False,
        "has_domains": True,
        "carries_values": False,
        "blocks": [{"no": 3, "text": 4, "ratings": {16: None}}],
    },
    {
        "key": "gmrc",
        "title": "Good Manners and Right Conduct (GMRC)",
        "pace_rows": (255, 285),
        "sheets": {0: "TERM 1-3 GMRC"},
        "learner_row": 15,
        "shape": "per_term_list",
        "uses_macro_skills": False,
        "has_domains": False,
        "carries_values": True,
        "blocks": [{"no": 3, "text": 4, "standard": 7, "ratings": {16: None}}],
    },
    {
        "key": "makabansa",
        "title": "Makabansa",
        "pace_rows": (293, 311),
        "sheets": {0: "G1 PACE FORM MAKABANSA"},
        "learner_row": 15,
        "shape": "per_term_list",
        "uses_macro_skills": False,
        "has_domains": False,
        "carries_values": False,
        "blocks": [{"no": 3, "text": 4, "ratings": {16: None}}],
    },
]


def clean(value):
    """Sheet text as a single tidy line, or None."""
    if value is None:
        return None
    text = unicodedata.normalize("NFKC", str(value))
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def slug(text, limit=100):
    out = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return out[:limit] or "x"


def merged_value(sheet, row, column):
    """A cell's value, following a merge back to the cell that holds it."""
    for rng in sheet.merged_cells.ranges:
        if rng.min_row <= row <= rng.max_row and rng.min_col <= column <= rng.max_col:
            return sheet.cell(row=rng.min_row, column=rng.min_col).value
    return sheet.cell(row=row, column=column).value


def fill_of(sheet, row, column):
    pattern = sheet.cell(row=row, column=column).fill
    if pattern is None or pattern.patternType is None:
        return None
    rgb = getattr(pattern.fgColor, "rgb", None)
    return rgb.upper() if isinstance(rgb, str) else None


class Extractor:
    def __init__(self, path, grade_level, code, title, published_on):
        self.book = openpyxl.load_workbook(path, data_only=False)
        self.pace = self.book["PACE - GRADE 1"]
        self.grade_level = grade_level
        self.code = code
        self.title = title
        self.published_on = published_on
        self.anomalies = []
        self.unknown_fills = OrderedDict()
        self.cells = OrderedDict()

    def note(self, area, where, message):
        self.anomalies.append({"area": area, "where": where, "message": message})

    # -- reading the PACE tree ---------------------------------------------

    def references(self, row, block, area):
        """The (sheet, column index, term) a row's rating cells point at.

        Formulas naming a sheet outside this area are dropped: DepEd's file has
        four of those, where a Language competency's Term 3 cell reads from a
        Reading & Literacy sheet. Keeping them would file Language marks under
        the wrong subject.
        """
        found = []
        wanted = set(area["sheets"].values())
        for column, term in block["ratings"].items():
            value = self.pace.cell(row=row, column=column).value
            if not isinstance(value, str) or "VLOOKUP" not in value:
                continue
            match = VLOOKUP.search(value)
            if not match:
                continue
            sheet, index = match.group(1), int(match.group(2))
            if sheet not in wanted:
                self.note(
                    area["key"],
                    "PACE!%s%d" % (openpyxl.utils.get_column_letter(column), row),
                    "formula reads '%s', which is not one of this area's sheets - dropped "
                    "(a known defect in DepEd's workbook)" % sheet,
                )
                continue
            # index is 1-based from column C, so column = C + index - 1.
            found.append({"column": index + 2, "term": term})
        return found

    def parse_block(self, area, block):
        """Walk one printed column of the PACE form top to bottom."""
        first, last = area["pace_rows"]
        items, domains = [], []
        current_term = 0
        current_domain = None
        parent = None       # the numbered competency children attach to
        leaf = None         # where rating cells land
        pending = None      # wording seen before its number (see below)

        for row in range(first, last + 1):
            label = clean(self.pace.cell(row=row, column=block["no"]).value)
            text = clean(self.pace.cell(row=row, column=block["text"]).value)
            refs = self.references(row, block, area)

            # A band spanning the table: either "Term 2" or a domain name.
            if label and not text:
                if label.lower().startswith("note:") or label.upper() == "LEGEND":
                    break  # the table has ended; what follows is the legend
                term_match = TERM_LABEL.match(label)
                if term_match:
                    current_term = int(term_match.group(1))
                    current_domain = None
                    continue
                code = slug(label)
                if not any(d["code"] == code and d["term"] == current_term for d in domains):
                    domains.append({
                        "code": code,
                        "title": label,
                        "term": current_term,
                        "sort_order": len(domains) + 1,
                    })
                current_domain = code
                continue

            if not text:
                # A continuation row: more rating cells for the same competency.
                if refs and leaf is not None:
                    leaf["refs"].extend(refs)
                elif refs:
                    self.note(area["key"], "PACE row %d" % row,
                              "rating cells with no competency above them - dropped")
                continue

            if text.lower().startswith("note:") or text.upper() == "LEGEND":
                break

            lettered = LETTERED.match(text)
            numbered = bool(label) and label.isdigit()

            def make(number, letter, body, is_child):
                node = {
                    "number": number,
                    "letter": letter,
                    "text": body,
                    "term": current_term,
                    "domain": current_domain,
                    "standard": clean(self.pace.cell(row=row, column=block["standard"]).value)
                    if "standard" in block else None,
                    "refs": list(refs),
                    "children": [],
                    "row": row,
                }
                if is_child and parent is not None:
                    parent["children"].append(node)
                else:
                    items.append(node)
                return node

            if numbered and lettered:
                # A number beside lettered wording means one of two things.
                #
                # Normally the number sits against the FIRST child and the parent
                # wording is the row above: DepEd lays out "22 / a. oneself and
                # family" with "Narrate one's personal experiences." above it.
                #
                # But Mathematics Term 2 numbers the children of competency 3
                # ("Determine:") as though they were top-level 3, 4 and 5. There
                # is no parent wording to pick up, and the letters simply carry on
                # from the children already collected, so treat those as children
                # and drop the stray number. Reproducing DepEd's numbering here
                # would invent two competencies that do not exist.
                letter = lettered.group(1).lower()
                if pending is None and parent is not None and parent["children"]:
                    previous = parent["children"][-1]["letter"]
                    if previous and ord(letter) == ord(previous) + 1:
                        leaf = make(parent["number"], letter, text, True)
                        self.note(area["key"], "PACE row %d" % row,
                                  "'%s' is numbered %s but continues competency %s's "
                                  "lettered children; kept as a child and the number "
                                  "dropped (a known defect in DepEd's workbook)"
                                  % (text[:32], label, parent["number"]))
                        pending = None
                        continue

                body = pending or text
                parent = make(label, None, body, False)
                parent["refs"] = []          # the refs on this row belong to the child
                parent["children"] = []
                leaf = {
                    "number": label,
                    "letter": letter,
                    "text": text,
                    "term": current_term,
                    "domain": current_domain,
                    "standard": None,
                    "refs": list(refs),
                    "children": [],
                    "row": row,
                }
                parent["children"].append(leaf)
                if pending is None:
                    self.note(area["key"], "PACE row %d" % row,
                              "competency %s starts at its first lettered child with no "
                              "parent wording above it; using the child's text" % label)
                pending = None
                continue

            if numbered:
                parent = make(label, None, text, False)
                leaf = parent
                pending = None
                continue

            if lettered:
                if parent is None:
                    self.note(area["key"], "PACE row %d" % row,
                              "lettered item '%s' with no numbered competency above it; "
                              "kept as a competency of its own" % text[:40])
                    leaf = make(None, lettered.group(1).lower(), text, False)
                else:
                    leaf = make(parent["number"], lettered.group(1).lower(), text, True)
                pending = None
                continue

            # Wording with neither a number nor a letter. Usually a parent
            # statement whose number appears on the next row; hold it and see.
            if refs:
                self.note(area["key"], "PACE row %d" % row,
                          "'%s' carries rating cells but has no number or letter; "
                          "kept as a competency" % text[:40])
                leaf = make(None, None, text, False)
                pending = None
            else:
                pending = text

        return items, domains

    # -- turning references into slots --------------------------------------

    def slots_for(self, area, refs):
        """Slots for an area with no macro skills: one per PACE rating cell.

        Mathematics, GMRC and Makabansa print a single rating column per
        competency, and the term comes from the enclosing "Term N" band rather
        than from the cell, so a reference simply *is* a slot. Areas that use
        macro skills do not come through here at all — see
        `assign_slots_from_headers`, which reads the class-summary sheet
        instead.
        """
        return [
            {"term": None,                    # filled in by the caller
             "macro_skill": NO_MACRO_SKILL,
             "column": ref["column"]}
            for ref in refs
        ]

    def column_owner(self, sheet):
        """Which competency each column of a class-summary sheet belongs to.

        The sheet says so itself: row 12 carries the competency number and row
        13 the lettered child. Two quirks of how DepEd fills those in:

        * Row 13 is written only on the FIRST column of a child's pair — the
          "Speaking" column beside it is left blank — so a blank inherits the
          letter to its left.
        * A competency with no lettered children repeats its own number on row
          13 rather than leaving it empty, which means "no child", not "child
          19".

        Yields (column, number, letter).
        """
        number, letter = None, None

        for column in range(11, sheet.max_column + 1):
            heading = clean(merged_value(sheet, 12, column))
            child = clean(merged_value(sheet, 13, column))

            if heading is not None and heading != number:
                number, letter = heading, None

            if child is not None:
                if child == number:
                    letter = None
                elif len(child) <= 2 and child.isalpha():
                    letter = child

            yield column, number, letter

    def assign_slots_from_headers(self, area, items):
        """Read a macro-skill area's slots straight off the class-summary sheets.

        ## Why not from the PACE formulas

        The obvious approach — take the columns a competency's PACE VLOOKUPs
        point at, then look those column numbers up in each term's sheet — is
        wrong, and wrong in a way that hides. It assumes the three term sheets
        share one column layout. DepEd's Grade 1 file breaks that: `TERM 3
        LANGUAGE` is two columns wider than its Term 1 and Term 2 siblings,
        because an extra child pair was inserted under competency 6, and every
        column after it is shifted by two. Reading Term 1's column numbers
        against the Term 3 sheet therefore lands on a neighbour's cell.

        It very nearly gets away with it, which is the dangerous part: where
        both children of a competency are assessed in Term 3 the shifted read
        lands on another filled cell and the *count* still comes out right.
        Grade 1 lost exactly one pair this way — Language competency 8 is
        assessed on child b in Term 3, and the shifted read credited it to
        child a.

        So each sheet is read entirely on its own terms: a cell's fill says
        whether a slot exists and which macro skill it is, and rows 12/13 above
        it say whose it is. Nothing is carried between sheets, so a layout that
        shifts cannot misattribute anything.

        ## Duplicates

        The same insertion left `TERM 3 LANGUAGE` with two adjacent pairs both
        labelled competency 6b. A second column for one (competency, term,
        skill) is DepEd's copied label, not a second assessment, so it is
        reported and dropped rather than counted.
        """
        seen = {}

        for term, sheet_name in sorted(area["sheets"].items()):
            sheet = self.book[sheet_name]

            for column, number, child in self.column_owner(sheet):
                argb = fill_of(sheet, area["learner_row"], column)
                skill = MACRO_SKILL_FILLS.get(argb)
                letter = get_column_letter(column)

                if skill is None:
                    if argb and argb not in ("FF000000", "00000000"):
                        self.unknown_fills.setdefault(argb, "%s!%s" % (sheet_name, letter))
                    continue  # not taught this term

                if number is None:
                    self.note(area["key"], "%s!%s" % (sheet_name, letter),
                              "column is filled for %s but rows 12/13 name no competency "
                              "- SLOT LOST, fix before loading" % skill)
                    continue

                node = self.find_node(items, number, child)

                if node is None:
                    self.note(area["key"], "%s!%s" % (sheet_name, letter),
                              "column is filled for %s but its heading (%s%s) matches no "
                              "competency on the PACE form - SLOT LOST, fix before loading"
                              % (skill, number, child or ""))
                    continue

                key = (id(node), term, skill)

                if key in seen:
                    self.note(area["key"], "%s!%s" % (sheet_name, letter),
                              "second %s column for competency %s%s in term %d, duplicating "
                              "%s - DepEd copied a heading when inserting a column; dropped"
                              % (skill, number, child or "", term, seen[key]))
                    continue

                seen[key] = letter
                node.setdefault("fill_slots", []).append(
                    {"term": term, "macro_skill": skill, "column": column})

    def find_node(self, items, number, letter):
        """The competency a class-summary column header names."""
        for node in items:
            if node["number"] != number:
                continue
            if letter is None:
                return node if not node["children"] else None
            for child in node["children"]:
                if child["letter"] == letter:
                    return child
        return None

    def build_area(self, area, sort_order):
        items, domains = [], []
        for block in area["blocks"]:
            block_items, block_domains = self.parse_block(area, block)
            items.extend(block_items)
            for domain in block_domains:
                if not any(d["code"] == domain["code"] and d["term"] == domain["term"]
                           for d in domains):
                    domain = dict(domain, sort_order=len(domains) + 1)
                    domains.append(domain)

        if area["uses_macro_skills"]:
            self.assign_slots_from_headers(area, items)

        competencies = []
        counts = {"competencies": 0, "slots": 0}

        def convert(node, parent_path, order):
            term = node["term"] or 0
            prefix = "T%d" % term if term else ""
            if node["letter"] and parent_path:
                path = "%s.%s" % (parent_path, node["letter"])
            elif node["number"]:
                path = "%s.%s" % (prefix, node["number"])
            else:
                path = "%s.r%d" % (prefix, node["row"])

            if area["uses_macro_skills"]:
                slots = list(node.get("fill_slots", []))
            else:
                slots = self.slots_for(area, node["refs"])
                for slot in slots:
                    if slot["term"] is None:
                        slot["term"] = term or 1
            slots.sort(key=lambda s: (s["term"], s["column"]))

            out = OrderedDict()
            out["path"] = path
            out["number"] = node["number"]
            out["letter"] = node["letter"]
            out["label"] = node["letter"] or node["number"] or ""
            out["text"] = node["text"]
            out["term"] = term
            out["domain"] = node["domain"]
            if area["carries_values"]:
                out["performance_standard"] = node["standard"]
            out["is_rateable"] = bool(slots)
            out["sort_order"] = order
            out["slots"] = [
                OrderedDict([("term", s["term"]),
                             ("macro_skill", s["macro_skill"]),
                             ("sort_order", i + 1)])
                for i, s in enumerate(slots)
            ]
            for s in slots:
                self.record_cell(area, path, s)
            counts["competencies"] += 1
            counts["slots"] += len(slots)

            children = []
            for i, child in enumerate(node["children"]):
                children.append(convert(child, path, i + 1))
            if children:
                out["children"] = children
            return out

        for i, node in enumerate(items):
            competencies.append(convert(node, None, i + 1))

        return OrderedDict([
            ("key", area["key"]),
            ("title", area["title"]),
            ("shape", area["shape"]),
            ("uses_macro_skills", area["uses_macro_skills"]),
            ("has_domains", area["has_domains"]),
            ("carries_values", area["carries_values"]),
            ("sort_order", sort_order),
            ("counts", counts),
            ("domains", domains),
            ("competencies", competencies),
        ])

    def record_cell(self, area, path, slot):
        """Remember which workbook cell a slot was read out of.

        The catalog itself deliberately does not carry this. A cell address is a
        property of *the template*, not of the curriculum: DepEd can reissue the
        same competencies on a sheet with two extra columns, and when they do,
        only the template and this map change. Keeping it out of
        `matatag_competency_slots` also means the .xlsx export never needed an
        ALTER TABLE on a table that already holds real marks.
        """
        book = self.cells.setdefault(area["key"], OrderedDict([
            ("learner_row", area["learner_row"]),
            ("slots", OrderedDict()),
        ]))
        sheet = area["sheets"].get(slot["term"]) or area["sheets"][0]
        key = "%s|%d|%s" % (path, slot["term"], slot["macro_skill"])
        book["slots"][key] = [sheet, slot["column"]]

    def cell_map(self):
        """The template cell map, for the .xlsx export."""
        return OrderedDict([
            ("template", "KEY_STAGE_1_GRADE_1_3_TERM.xlsx"),
            ("version_code", self.code),
            ("areas", self.cells),
        ])

    def run(self):
        areas = [self.build_area(area, i + 1) for i, area in enumerate(AREAS)]
        totals = {
            "competencies": sum(a["counts"]["competencies"] for a in areas),
            "slots": sum(a["counts"]["slots"] for a in areas),
        }
        return OrderedDict([
            ("version", OrderedDict([
                ("code", self.code),
                ("title", self.title),
                ("grade_level", self.grade_level),
                ("source", "KEY_STAGE_1_GRADE_1_3_TERM.xlsx"),
                ("published_on", self.published_on),
            ])),
            ("counts", totals),
            ("learning_areas", areas),
        ])


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workbook")
    parser.add_argument("-o", "--out", default="grade-1.v1.json")
    parser.add_argument("--grade", default="Grade 1")
    parser.add_argument("--code", default="deped-matatag-ks1-grade-1-v1")
    parser.add_argument("--title", default="DepEd MATATAG Key Stage 1 - Grade 1")
    parser.add_argument("--published-on", default=None)
    args = parser.parse_args()

    extractor = Extractor(args.workbook, args.grade, args.code, args.title,
                          args.published_on)
    catalog = extractor.run()

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(catalog, handle, indent=1, ensure_ascii=False)
        handle.write("\n")

    cells = extractor.cell_map()
    cells_out = args.out.replace(".json", ".cells.json")
    with open(cells_out, "w", encoding="utf-8") as handle:
        json.dump(cells, handle, indent=1, ensure_ascii=False)
        handle.write("\n")

    print("wrote %s" % args.out)
    print("wrote %s (%d cells)" % (
        cells_out, sum(len(a["slots"]) for a in cells["areas"].values())))
    print()
    print("%-26s %13s %7s %8s" % ("LEARNING AREA", "COMPETENCIES", "SLOTS", "DOMAINS"))
    for area in catalog["learning_areas"]:
        print("%-26s %13d %7d %8d" % (
            area["key"], area["counts"]["competencies"],
            area["counts"]["slots"], len(area["domains"])))
    print("%-26s %13d %7d" % ("TOTAL", catalog["counts"]["competencies"],
                              catalog["counts"]["slots"]))

    print()
    print("slots per term")
    for area in catalog["learning_areas"]:
        per = {}

        def walk(nodes):
            for node in nodes:
                for slot in node["slots"]:
                    per[slot["term"]] = per.get(slot["term"], 0) + 1
                walk(node.get("children", []))

        walk(area["competencies"])
        print("  %-24s %s" % (area["key"],
                              "  ".join("T%d=%d" % (t, per.get(t, 0)) for t in (1, 2, 3))))

    if extractor.unknown_fills:
        print()
        print("UNKNOWN FILLS - these cells are coloured but match no macro skill.")
        print("Add them to MACRO_SKILL_FILLS here and to config/matatag.php, then re-run:")
        for argb, where in extractor.unknown_fills.items():
            print("  %s  first seen at %s" % (argb, where))

    print()
    if extractor.anomalies:
        print("ANOMALIES (%d) - check each against the PACE sheet before loading:"
              % len(extractor.anomalies))
        for item in extractor.anomalies:
            print("  [%s] %s: %s" % (item["area"], item["where"], item["message"]))
    else:
        print("no anomalies")

    return 0


if __name__ == "__main__":
    sys.exit(main())
