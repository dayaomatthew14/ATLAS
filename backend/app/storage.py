"""
Where uploaded files live on disk, and how stored paths map onto that.

Profile photos were written to a path relative to the working directory and
served from a mount hard-coded to the same name. On Railway the container
filesystem is ephemeral, so every deploy deleted every photo while the database
kept rows pointing at files that no longer existed.

Two paths are deliberately kept separate here:

  * the DISK path, which `UPLOAD_DIR` moves (to a mounted volume in a
    deployment, to the historical `uploads/` directory in development);
  * the STORED path, which is what `User.profile_picture` holds and what the
    browser requests, and which never changes.

Keeping the stored form fixed is what lets `UPLOAD_DIR` be repointed without
rewriting existing rows.
"""

import os

# The default is anchored to the backend package rather than left relative to
# the working directory. As a bare "uploads" it resolved against wherever the
# process happened to start: running the test suite from the repository root --
# which is how CI runs it -- imported the app and created a second, empty
# `uploads/` beside the source tree, while the real one sat in `backend/`.
# Photos written by a server started from one directory were then invisible to
# a server started from another.
#
# UPLOAD_DIR is still honoured verbatim when set, which is what a deployment
# does to point at a mounted volume.
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UPLOAD_DIR = os.getenv("UPLOAD_DIR") or os.path.join(_BACKEND_ROOT, "uploads")

# The public URL prefix, and the first segment of every stored path. Fixed.
PUBLIC_PREFIX = "uploads"


def profiles_dir() -> str:
    """Directory on disk holding profile photos."""
    return os.path.join(UPLOAD_DIR, "profiles")


def stored_path(filename: str) -> str:
    """The value written to the database; served to the browser as /<value>."""
    return f"{PUBLIC_PREFIX}/profiles/{filename}"


def disk_path(stored: str) -> str:
    """Resolve a stored path to its location on disk."""
    rel = str(stored).lstrip("/")
    if rel.startswith(PUBLIC_PREFIX + "/"):
        return os.path.join(UPLOAD_DIR, rel[len(PUBLIC_PREFIX) + 1:])
    # A value that predates this mapping, or an absolute path: use it as given.
    return rel
