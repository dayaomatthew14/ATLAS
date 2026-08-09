"""
Find and repair departments that are not one of the four institutional colleges.

`departments` used to hold one private workspace per user account: registration
minted `DEPT_{user_id}` and pointed the user at it. The table now holds the four
seeded colleges, but the seeder only inserts and updates -- it is documented as
never deleting, so a block whose name matches no seeded programme keeps its
data. The consequence is that every environment carries whatever rows it
happened to accumulate, and two environments running identical code can show
different colleges in the admin screens.

Those leftovers are not harmless. A faculty member or subject still pointing at
one is invisible to the application: every scoped query filters by the signed-in
user's college, and no user belongs to a leftover, so the records exist with
nobody able to reach them.

Deleting the row is not the fix either. `faculty`, `curriculum`,
`curriculum_blocks`, `programs` and `ai_rules` all declare
`ondelete="CASCADE"` on `department_id`, so removing a department takes its
faculty and subjects with it, without confirmation and without a way back.

So this script reports by default and writes nothing. Reassignment moves the
records to a real college first; deletion is refused until nothing references
the row.

    # Report (no writes). Run from the backend/ directory.
    python audit_departments.py

    # Move everything off a leftover, onto a real college.
    python audit_departments.py --reassign TD1 CAST --yes

    # Remove the row, only once nothing references it.
    python audit_departments.py --delete TD1 --yes

Set DATABASE_URL to point at a deployed database instead of the local SQLite
file. Check which database you are attached to in the banner before passing
--yes: the whole reason this script exists is that environments differ.
"""

import argparse
import os
import sys

from app import database, models
from app.academics import COLLEGE_CODES


# Every table that points at a department, and whether losing the department
# would take the rows with it. The CASCADE column is what makes a careless
# delete unrecoverable, so it is shown in the report rather than left implicit.
REFERENCES = [
    ("faculty", models.Faculty, True),
    ("curriculum", models.Curriculum, True),
    ("curriculum_blocks", models.CurriculumBlock, True),
    ("programs", models.Program, True),
    ("ai_rules", models.AIRule, True),
    ("system_logs", models.SystemLog, False),
]


def count_references(db, department_id):
    return {
        name: db.query(model).filter(model.department_id == department_id).count()
        for name, model, _cascades in REFERENCES
    }


def describe_database():
    url = database.SQLALCHEMY_DATABASE_URL
    # Never print credentials: a Postgres URL carries the password in the host
    # portion, and this output is the sort of thing that ends up pasted into a
    # chat or an issue.
    return url.split("@")[-1] if "@" in url else url


def load_departments(db):
    seeded, leftovers = [], []
    for dept in db.query(models.Department).order_by(models.Department.id).all():
        (seeded if dept.code in COLLEGE_CODES else leftovers).append(dept)
    return seeded, leftovers


def report(db):
    seeded, leftovers = load_departments(db)

    print(f"Database: {describe_database()}")
    print(f"Seeded colleges: {', '.join(COLLEGE_CODES)}")
    print()

    print("INSTITUTIONAL COLLEGES")
    for dept in seeded:
        refs = count_references(db, dept.id)
        summary = ", ".join(f"{k}={v}" for k, v in refs.items() if v)
        print(f"  id={dept.id:<4} {dept.code:<8} {summary or 'no records'}")

    if not leftovers:
        print()
        print("No leftover departments. Nothing to repair.")
        return 0

    print()
    print("LEFTOVER DEPARTMENTS (not one of the four colleges)")
    stranded_total = 0
    for dept in leftovers:
        refs = count_references(db, dept.id)
        cascading = sum(
            refs[name] for name, _model, cascades in REFERENCES if cascades
        )
        stranded_total += cascading
        print(f"  id={dept.id:<4} {dept.code:<8} {dept.name}")
        for name, _model, cascades in REFERENCES:
            if refs[name]:
                marker = "  <-- deleted with the department" if cascades else ""
                print(f"           {name}: {refs[name]}{marker}")
        if not cascading:
            print("           nothing references it; safe to delete")

    # `users.department` is a code string, not a foreign key, so a user can name
    # a department that no longer exists and nothing in the schema objects.
    orphan_users = [
        u for u in db.query(models.User).all()
        if u.department and u.department not in COLLEGE_CODES
    ]
    if orphan_users:
        print()
        print("USERS POINTING AT A NON-COLLEGE DEPARTMENT")
        for user in orphan_users:
            print(f"  {user.email} -> {user.department!r} (role: {user.role})")

    print()
    if stranded_total:
        print(f"{stranded_total} record(s) are stranded: they exist but no signed-in")
        print("user's college matches, so no screen in ATLAS can reach them.")
        print("Reassign them to a real college before deleting anything:")
        print("  python audit_departments.py --reassign <CODE> <COLLEGE> --yes")
    return 1


def find_department(db, code):
    dept = db.query(models.Department).filter(models.Department.code == code).first()
    if not dept:
        print(f"No department with code {code!r}.", file=sys.stderr)
    return dept


def reassign(db, from_code, to_code, confirmed):
    source = find_department(db, from_code)
    if not source:
        return 2

    if from_code in COLLEGE_CODES:
        print(
            f"{from_code} is one of the four institutional colleges. This script "
            "only moves records off leftover departments.",
            file=sys.stderr,
        )
        return 2

    if to_code not in COLLEGE_CODES:
        print(
            f"{to_code} is not an institutional college. Move records onto one of: "
            f"{', '.join(COLLEGE_CODES)}.",
            file=sys.stderr,
        )
        return 2

    target = find_department(db, to_code)
    if not target:
        return 2

    refs = count_references(db, source.id)
    if not any(refs.values()):
        print(f"Nothing references {from_code}. Use --delete to remove the row.")
        return 0

    print(f"Database: {describe_database()}")
    print(f"Move records from {from_code} (id={source.id}) to {to_code} (id={target.id}):")
    for name, _model, _cascades in REFERENCES:
        if refs[name]:
            print(f"  {name}: {refs[name]}")

    if not confirmed:
        print()
        print("Nothing was written. Re-run with --yes to apply.")
        return 0

    moved = 0
    for name, model, _cascades in REFERENCES:
        if not refs[name]:
            continue
        moved += db.query(model).filter(
            model.department_id == source.id
        ).update({model.department_id: target.id}, synchronize_session=False)

    # Users name their department by code, so they need the string, not the id.
    user_rows = db.query(models.User).filter(models.User.department == from_code).update(
        {models.User.department: to_code}, synchronize_session=False
    )

    db.commit()
    print()
    print(f"Moved {moved} record(s) and repointed {user_rows} user account(s).")
    print(f"{from_code} now has no references and can be deleted:")
    print(f"  python audit_departments.py --delete {from_code} --yes")
    return 0


def delete(db, code, confirmed):
    dept = find_department(db, code)
    if not dept:
        return 2

    if code in COLLEGE_CODES:
        print(
            f"{code} is one of the four institutional colleges and is seeded at "
            "startup. Refusing to delete it.",
            file=sys.stderr,
        )
        return 2

    refs = count_references(db, dept.id)
    blocking = {name: n for name, n in refs.items() if n}
    if blocking:
        print(f"Refusing to delete {code}: it still has records attached.", file=sys.stderr)
        for name, n in blocking.items():
            print(f"  {name}: {n}", file=sys.stderr)
        print(file=sys.stderr)
        print(
            "Deleting now would take the cascading rows with it. Move them first:",
            file=sys.stderr,
        )
        print(f"  python audit_departments.py --reassign {code} <COLLEGE> --yes", file=sys.stderr)
        return 1

    print(f"Database: {describe_database()}")
    print(f"Delete department {code} (id={dept.id}, {dept.name}). Nothing references it.")

    if not confirmed:
        print()
        print("Nothing was written. Re-run with --yes to apply.")
        return 0

    db.delete(dept)
    db.commit()
    print()
    print(f"Deleted {code}.")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Report and repair departments outside the four institutional colleges.",
    )
    parser.add_argument(
        "--reassign", nargs=2, metavar=("FROM_CODE", "TO_COLLEGE"),
        help="Move every record off FROM_CODE onto TO_COLLEGE.",
    )
    parser.add_argument(
        "--delete", metavar="CODE",
        help="Delete a leftover department. Refused while anything references it.",
    )
    parser.add_argument(
        "--yes", action="store_true",
        help="Apply the change. Without it, the planned writes are printed and nothing runs.",
    )
    args = parser.parse_args(argv)

    if args.reassign and args.delete:
        parser.error("Use --reassign or --delete, not both.")

    db = database.SessionLocal()
    try:
        if args.reassign:
            return reassign(db, args.reassign[0], args.reassign[1], args.yes)
        if args.delete:
            return delete(db, args.delete, args.yes)
        return report(db)
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
