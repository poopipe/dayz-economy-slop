"""Commit pending app code to local main. No Cursor trailers."""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES_TO_COMMIT = [
    "data/marker_colors.json",
    "static/js/economy_editor.js",
]

COMMIT_MESSAGE = (
    "Improve economy editor row selection/filters and add marker colors "
    "for new territory/event types.\n"
)


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.stdout:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
    if result.stderr:
        print(result.stderr, end="" if result.stderr.endswith("\n") else "\n", file=sys.stderr)
    if check and result.returncode != 0:
        raise SystemExit(f"Command failed ({result.returncode}): {' '.join(args)}")
    return result


def main() -> None:
    run(["git", "add", "--"] + FILES_TO_COMMIT)

    # Message file avoids shell quoting and any --trailer injection on argv.
    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, encoding="utf-8"
    ) as fh:
        fh.write(COMMIT_MESSAGE)
        msg_path = fh.name

    try:
        run(["git", "commit", "-F", msg_path])
    finally:
        Path(msg_path).unlink(missing_ok=True)

    log = run(["git", "log", "-1", "--format=full"]).stdout
    lowered = log.lower()
    if "co-authored-by" in lowered or "made-with: cursor" in lowered or "cursoragent" in lowered:
        print("ERROR: attribution found in commit; aborting further steps.", file=sys.stderr)
        raise SystemExit(2)

    run(["git", "status"])
    print("OK: commit has no Cursor attribution.")


if __name__ == "__main__":
    main()
