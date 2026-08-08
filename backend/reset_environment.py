"""
Return a deployment to a clean state for testing.

The intended use is a deployed environment whose data has drifted from what you
want to test against -- curriculum imported by hand, half-generated timetables,
accounts created during earlier experiments. It clears that data and leaves the
things the application recreates for itself.

    Always preserved
      departments   the four institutional colleges, reseeded at startup anyway
      programs      the twelve programmes, likewise
      users         the administrator account, and by default every account

    Cleared, by scope
      timetable     schedules, conflicts, subject offerings
      operational   the above plus faculty, curriculum, rooms, semesters,
                    AI rules and system logs                        (default)
      all           the above plus every non-administrator account and any
                    leftover department outside the four colleges

Nothing is written without --confirm, and --confirm has to name the database you
are pointing at. That is deliberate: this script exists because environments
differ, and the failure it is most likely to cause is running it against the
wrong one. The dry run prints the name to pass.

    # See what would be cleared. Run from the backend/ directory.
    python reset_environment.py

    # Against a deployed database.
    DATABASE_URL="postgresql://..." python reset_environment.py

    # Apply.
    DATABASE_URL="postgresql://..." python reset_environment.py --confirm <name>

After it runs, restart the service. Startup reseeds the colleges and programmes
and recreates the administrator account if it is missing -- see
`seed_academic_taxonomy` and the admin seeder in main.py.
"""

import argparse
import sys

from app import database, models
from app.academics import COLLEGE_CODES


# Order matters: children before parents. Several of these would cascade
# anyway, but relying on cascade order across two different database engines is
# how a reset half-succeeds and leaves rows pointing at nothing.
TIMETABLE_TABLES = [
    ("conflicts", models.Conflict),
    ("schedules", models.Schedule),
    ("subject_offerings", models.SubjectOffering),
]

OPERATIONAL_TABLES = TIMETABLE_TABLES + [
    ("faculty_unavailability", models.FacultyUnavailability),
    ("ai_rules", models.AIRule),
    ("faculty", models.Faculty),
    ("curriculum", models.Curriculum),
    ("curriculum_blocks", models.CurriculumBlock),
    ("rooms", models.Room),
    ("semesters", models.Semester),
    ("system_logs", models.SystemLog),
]

SCOPES = {
    "timetable": TIMETABLE_TABLES,
    "operational": OPERATIONAL_TABLES,
    "all": OPERATIONAL_TABLES,
}

ADMIN_ROLE = "admin"


def database_name():
    """
    A short name for the database being targeted, safe to print.

    A Postgres URL carries its password in the host portion, so the credential
    is dropped rather than shown -- this string ends up in terminal scrollback
    and in whatever the user pastes when asking for help.
    """
    url = database.SQLALCHEMY_DATABASE_URL
    tail = url.split("@")[-1] if "@" in url else url
    return tail.split("?")[0].rstrip("/").split("/")[-1] or tail


def plan(db, scope):
    counts = [(name, db.query(model).count()) for name, model in SCOPES[scope]]

    extras = []
    if scope == "all":
        non_admin = db.query(models.User).filter(models.User.role != ADMIN_ROLE).count()
        leftovers = [
            d for d in db.query(models.Department).all() if d.code not in COLLEGE_CODES
        ]
        extras = [
            ("users (non-administrator)", non_admin),
            ("departments (outside the four colleges)", len(leftovers)),
        ]
    return counts, extras


def preserved_summary(db):
    colleges = db.query(models.Department).filter(
        models.Department.code.in_(COLLEGE_CODES)
    ).count()
    programs = db.query(models.Program).count()
    admins = db.query(models.User).filter(models.User.role == ADMIN_ROLE).count()
    return colleges, programs, admins


def show(db, scope):
    counts, extras = plan(db, scope)
    colleges, programs, admins = preserved_summary(db)

    print(f"Database: {database_name()}")
    print(f"Scope:    {scope}")
    print()

    print("WOULD BE CLEARED")
    total = 0
    for name, n in counts + extras:
        total += n
        marker = "" if n else "   (already empty)"
        print(f"  {name:<42} {n:>6}{marker}")

    print()
    print("WOULD BE PRESERVED")
    print(f"  {'departments (institutional colleges)':<42} {colleges:>6}")
    print(f"  {'programs':<42} {programs:>6}")
    print(f"  {'users (administrator)':<42} {admins:>6}")
    if scope != "all":
        others = db.query(models.User).filter(models.User.role != ADMIN_ROLE).count()
        print(f"  {'users (all other accounts)':<42} {others:>6}")

    print()
    if not total:
        print("Nothing to clear. This environment is already in a fresh state.")
        return 0

    print(f"{total} row(s) would be deleted. Nothing has been written.")
    print("To apply, name the database you are pointing at:")
    print(f"  python reset_environment.py --scope {scope} --confirm {database_name()}")
    return 0


def apply(db, scope):
    deleted = {}

    for name, model in SCOPES[scope]:
        n = db.query(model).delete(synchronize_session=False)
        if n:
            deleted[name] = n

    if scope == "all":
        # `departments.owner_id` is ondelete=CASCADE onto users, a leftover from
        # when registration minted one department per account. Deleting a user
        # who still owns a college would take the college with it, so the link
        # is broken before any account is removed. Local databases have this
        # null; older deployed ones may not.
        disowned = db.query(models.Department).filter(
            models.Department.owner_id.isnot(None)
        ).update({models.Department.owner_id: None}, synchronize_session=False)
        if disowned:
            deleted["departments disowned (kept)"] = disowned

        n = db.query(models.User).filter(
            models.User.role != ADMIN_ROLE
        ).delete(synchronize_session=False)
        if n:
            deleted["users (non-administrator)"] = n

        leftovers = [
            d for d in db.query(models.Department).all() if d.code not in COLLEGE_CODES
        ]
        for dept in leftovers:
            db.delete(dept)
        if leftovers:
            deleted["departments (outside the four colleges)"] = len(leftovers)

    db.commit()
    return deleted


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Clear a deployment's data for testing, keeping the seeded taxonomy.",
    )
    parser.add_argument(
        "--scope", choices=sorted(SCOPES), default="operational",
        help="How much to clear (default: operational).",
    )
    parser.add_argument(
        "--confirm", metavar="DATABASE",
        help="Apply the reset. Must match the database name shown by the dry run.",
    )
    args = parser.parse_args(argv)

    db = database.SessionLocal()
    try:
        if not args.confirm:
            return show(db, args.scope)

        expected = database_name()
        if args.confirm != expected:
            print(
                f"--confirm says {args.confirm!r} but this process is connected to "
                f"{expected!r}. Nothing was written.",
                file=sys.stderr,
            )
            print(
                "Check DATABASE_URL before retrying: this guard exists to stop a "
                "reset landing on the wrong environment.",
                file=sys.stderr,
            )
            return 2

        print(f"Database: {expected}")
        print(f"Scope:    {args.scope}")
        print()

        deleted = apply(db, args.scope)
        if not deleted:
            print("Nothing to clear. This environment was already fresh.")
            return 0

        print("CLEARED")
        for name, n in deleted.items():
            print(f"  {name:<42} {n:>6}")

        print()
        print("Restart the service. Startup reseeds the four colleges and twelve")
        print("programmes, and recreates the administrator account if it is missing.")
        if args.scope == "all":
            print()
            print("Every non-administrator account is gone, so the chairs and")
            print("coordinators you test with need registering again.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
