"""
The institutional academic taxonomy: four colleges and the degree programmes
they offer.

This is reference data, not user data. It is seeded at startup and edited only
by an administrator, which is the whole point -- before this, a "department" was
created per user account at registration (`DEPT_{user_id}`), so three separate
rows could all mean CAST and no screen could say "the curriculum for BS
Agriculture" and mean anything by it.
"""

COLLEGES = [
    {
        "code": "CVMAS",
        "name": "College of Veterinary Medicine & Agricultural Sciences",
        "programs": [
            ("DVM", "Doctor of Veterinary Medicine"),
            ("BSFT", "BS Food Technology"),
            # Deliberately not "BSA": that is equally the natural abbreviation
            # for BS Accountancy in CBMA, and programme codes are printed on
            # timetables where there is no context to tell them apart.
            ("BSAGR", "BS Agriculture"),
        ],
    },
    {
        "code": "CBMA",
        "name": "College of Business, Management & Accountancy",
        "programs": [
            ("BSAC", "BS Accountancy"),
            ("BSBA", "BS Business Administration"),
            ("BSHM", "BS Hospitality Management"),
            ("BSTM", "BS Tourism Management"),
        ],
    },
    {
        "code": "COED",
        "name": "College of Education",
        "programs": [
            ("BEED", "Bachelor in Elementary Education"),
            ("BSED", "Bachelor in Secondary Education"),
        ],
    },
    {
        "code": "CAST",
        "name": "College of Arts, Sciences & Technology",
        "programs": [
            ("ABPSY", "BA Psychology"),
            ("BSCPE", "BS Computer Engineering"),
            ("BSCS", "BS Computer Science"),
        ],
    },
]

COLLEGE_CODES = [c["code"] for c in COLLEGES]


def _normalise(text: str) -> str:
    return "".join(ch for ch in (text or "").upper() if ch.isalnum() or ch == " ")


# Phrases that identify a programme in a free-text block name, longest first so
# "COMPUTER ENGINEERING" is tested before "COMPUTER".
_MATCH_HINTS = [
    ("BSCPE", ["COMPUTER ENGINEERING"]),
    ("BSCS", ["COMPUTER SCIENCE"]),
    ("ABPSY", ["PSYCHOLOGY"]),
    ("DVM", ["VETERINARY"]),
    ("BSFT", ["FOOD TECHNOLOGY"]),
    ("BSAGR", ["AGRICULTURE", "AGRICULTURAL"]),
    ("BSAC", ["ACCOUNTANCY", "ACCOUNTING"]),
    ("BSBA", ["BUSINESS ADMINISTRATION"]),
    ("BSHM", ["HOSPITALITY"]),
    ("BSTM", ["TOURISM"]),
    ("BEED", ["ELEMENTARY EDUCATION"]),
    ("BSED", ["SECONDARY EDUCATION"]),
]


def match_program_code(block_name: str):
    """
    Best-effort mapping of an existing free-text block name onto a programme
    code. Returns None when nothing matches -- an unmatched block is a real
    state that the Unassigned group exists to show, not something to guess at.
    """
    haystack = _normalise(block_name)
    if not haystack:
        return None
    for code, hints in _MATCH_HINTS:
        for hint in hints:
            if hint in haystack:
                return code
    return None
