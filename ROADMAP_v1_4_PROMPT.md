# Master Prompt & Specification: Curriculum Excel Parser (v1.4)

**ATLAS Academic Timetabling System — Curriculum Ingestion Engine Specification**

---

## STEP 0 — CURRICULUM BLOCK ISOLATION (IMPORT IDENTITY RULE)

Every uploaded `.xlsx` curriculum file must be treated as a completely independent curriculum entity. The following rules are non-negotiable:

### 1. One File = One Block
- Every imported curriculum file creates its own isolated curriculum block.
- No two curriculum files share a block, regardless of how many files are imported or in what order.
- Importing a second curriculum file must never append, merge, or overwrite data into an existing curriculum block.

### 2. Block Identity Detection
Upon import, extract the following from the curriculum sheet to serve as the unique identity of that block:
- **Program Name** — detected from the header area (e.g., `"BACHELOR OF SCIENCE IN COMPUTER SCIENCE"`, `"BACHELOR OF SCIENCE IN COMPUTER ENGINEERING"`). This is the block's primary identifier.
- **Academic Year** — detected from the header area (e.g., `"AY 2026"`). This is the block's secondary identifier.
- Together, **Program Name + Academic Year** form a unique block key.

### 3. Duplicate Import Handling
- Before creating a new block, check if a block with the same Program Name + Academic Year key already exists.
- If no match exists → create a brand new isolated block for this curriculum.
- If a match exists → do not create a duplicate. Instead, prompt the user: a block for this program and academic year already exists. Ask whether to replace the existing block or cancel the import. Never silently overwrite.

### 4. Block Isolation Rule
- All subject data, unit totals, year/term zones, and electives extracted from a file belong exclusively to that file's block.
- No data from one curriculum block must ever bleed into, reference, or affect another curriculum block.
- Each block is fully self-contained from import to output.

---

## STEP 1 — SHEET IDENTIFICATION

1. Open the uploaded `.xlsx` file.
2. Scan all available sheets and identify the one that contains the university logo and university name. This is the only sheet to be parsed. All other sheets must be completely ignored.
3. If no sheet can be confidently identified, return an error rather than guessing.

---

## STEP 2 — DOCUMENT STRUCTURE OVERVIEW

Every curriculum sheet follows this fixed top-to-bottom order:
1. **Header Area** — University name, program name, academic year, and other metadata. Do not extract subjects from here.
2. **Year/Term Blocks** — Repeating zones from First Year to Fourth Year, each with one or more terms and their respective subjects.
3. **Electives Block** — Appears after all Fourth Year term blocks. Triggered by a row containing an ELECTIVES-type keyword.
4. **Summary of Units** — Appears at the very bottom. Used strictly for cross-validation. Never extract subjects from here.

---

## STEP 3 — PRE-PROCESSING BEFORE PARSING

This step must be executed exactly as described. Incorrect pre-processing is the single most common source of parsing errors.

### Merged Cell Handling — PRECISE RULE
1. Read the file's actual merge metadata to get the exact list of merged cell regions (e.g., using `ws.merged_cells.ranges` in openpyxl).
2. For each merged region, unmerge it and fill only the cells within that specific merged region with the merged cell's value.
3. Do NOT apply any forward-fill, downward-fill, or rightward-fill beyond the boundaries of actual merged regions.
4. Cells that are `None` because they are genuinely empty — such as the Course Code and Course Title columns of a totals row — must remain `None`. They must never inherit values from adjacent rows or columns.
5. This distinction is critical: a cell is only filled if it was part of a merged region in the original file. All other `None` cells stay `None`.

### Empty Row Handling
- Do not treat empty rows as zone boundaries.
- An empty row is noise — ignore it and continue scanning within the current zone.
- Only a new Year/Term header row or an ELECTIVES trigger row may close a zone.

### Column Position Handling
- Do not assume any column is in a fixed position anywhere in the sheet.
- Column layout must be re-detected dynamically at every new Zone Header.

---

## STEP 4 — YEAR/TERM ZONE PARSING

Scan all rows top to bottom sequentially. A zone begins when a row is detected containing both:
- **A Year keyword**: `"FIRST YEAR"`, `"SECOND YEAR"`, `"THIRD YEAR"`, `"FOURTH YEAR"`, or ordinal/numeric equivalents (e.g., `"1ST YEAR"`, `"YEAR 1"`).
- **A Term keyword**: `"First Term"`, `"Second Term"`, `"Third Term"`, `"First Semester"`, `"Second Semester"`, or equivalents.

This row is the Zone Header. Do not extract subject data from it.

### Column Detection Per Zone
- After the Zone Header, locate the next non-empty row. This is the column label row for that zone.
- Read and map all column labels present dynamically. Do not hardcode expected column names.
- This detection must repeat fresh at every new Zone Header. Never carry column positions from a previous zone.

### Subject Row Validation
A row is accepted as a valid subject only if all of the following are true on the raw, pre-processed data:
1. The Course Code column (or equivalent identifier) is non-empty and non-None.
2. The Units column contains a non-zero positive numeric value.
3. It is not a column label row — identified by header keywords such as "Grade", "Course Code", "Course Title", "Units", "Lec", "Lab", or equivalents in the identifier column.
4. It is not a totals or subtotal row — a totals row is definitively identified by having a None or empty identifier column (Course Code) while simultaneously having numeric values in unit columns. Because totals rows are identified from raw pre-processed data (before any fill), their Course Code remains None and they will never pass this check.
5. It is not a fully empty row.

### Zone Close Conditions
- **First Year through Third Year**: A new Year/Term header row closes the current zone and opens a new one immediately. Reset all zone counters.
- **Fourth Year between terms**: Same as above.
- **Fourth Year final term**: Closes when a row containing an ELECTIVES-type keyword is detected — e.g., `"Professional Electives"`, `"Free Electives"`, `"Elective Courses"`, or any row whose primary cell contains `"Elective"` or `"Electives"`. Close only on the first such row after the last Fourth Year term.

---

## STEP 5 — ELECTIVES BLOCK PARSING

1. Begin a dedicated electives scan once the ELECTIVES trigger row is detected.
2. Apply the same dynamic column detection and subject row validation from Step 4.
3. Detect sub-category labels dynamically as they appear. Do not hardcode category names. Group subjects under whatever label is present.
4. The Electives block ends when a row is detected containing `"SUMMARY OF UNITS"`, `"TOTAL UNITS"`, or an equivalent summary phrase.

---

## STEP 6 — SUMMARY OF UNITS (VALIDATION ONLY)

1. Locate the Summary of Units section dynamically — identified by a row or area containing `"SUMMARY OF UNITS"`, `"TOTAL UNITS"`, or equivalent.
2. Do not assume which line items or category labels appear. Each curriculum will differ. Read and extract all label-value pairs exactly as found.
3. Never extract subject rows from this section.
4. Use the grand total value — labeled `"TOTAL UNITS"` or the final numeric total in the summary — as a cross-validation check against the sum of all parsed zone units plus electives.
5. If they match → validation passed.
6. If they do not match → flag a discrepancy, return both values, do not silently override either.

---

## STEP 7 — DEDUPLICATION — SCOPED AND PRECISE

### Scenario A — Consecutive Duplicate Rows Within the Same Zone
- After unmerging, consecutive rows within the same zone may appear identical because they were originally one merged row.
- **Rule**: If two or more consecutive rows within the same zone share an identical combination of Course Code + Course Title + Units, collapse them into a single entry.
- This applies only to consecutive rows within the same zone. Never across zones.

### Scenario B — Repeated Course Codes Across Different Zones
- The same course code may intentionally appear in multiple zones. Placeholder cognate/elective codes are commonly reused across terms and year levels.
- **Rule**: Never deduplicate across zones. Every zone is parsed fully independently. A course code seen in one zone has no bearing on any other zone.

### Scenario C — Same Code, Different Title, Anywhere
- Always keep both. They are distinct subjects regardless of location.

### Deduplication Matrix

| Situation | Action |
| :--- | :--- |
| Same Code + Same Title + Same Units, consecutive rows, same zone | Collapse into one — merge artifact |
| Same Code + Same Title + Same Units, non-consecutive, same zone | Keep both |
| Same Code + Same Title, different zones | Keep both |
| Same Code + Different Title, anywhere | Keep both |
| Different Code, anything | Always keep |

---

## STEP 8 — OUTPUT STRUCTURE (FULLY DYNAMIC)

Output is structured per zone. Never hardcode field names, subject names, column names, or unit values.
Whatever columns were dynamically detected in a zone become the output fields for subjects in that zone.
Every Year/Term zone outputs:
- The Year and Term label exactly as detected.
- A list of validated subject rows, each containing the dynamically detected fields.
- A unit total summed only from valid subject rows — never from totals rows.

The Electives block follows the same structure, grouped under detected sub-category labels.
The Summary section outputs all label-value pairs exactly as found, plus the grand total.
Backend output only. Return structured data. The frontend handles all display and rendering.

---

## STEP 9 — GLOBAL RULES (NON-NEGOTIABLE)

1. Never forward-fill beyond actual merged regions. Genuinely empty cells must stay empty. This is the single most critical implementation rule.
2. Never hardcode subject names, category names, column names, unit values, or any curriculum-specific content.
3. Never use course code as a global unique key. Course codes are only meaningful within a single zone.
4. Never maintain a global seen-codes list. It silently drops valid subjects.
5. Never carry column positions from one zone to another. Re-detect at every Zone Header.
6. Never close a zone on an empty row.
7. Never extract subjects from the Summary section.
8. Never hallucinate subjects. Only extract rows that explicitly pass all validation in Step 4.
9. Never silently override a discrepancy between parsed totals and the Summary grand total.

> **Core principle**: The parser reads the file's actual structure. It fills only what was merged, leaves everything else untouched, never assumes, never hardcodes, and never silently drops or overrides data.
