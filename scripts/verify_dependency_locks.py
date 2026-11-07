#!/usr/bin/env python3
"""Verify npm lockfiles against the exact manifests and locked transitive packages.

The source importer must not resolve mutable semver ranges during deployment.
A checked-out Git commit is the only authorized fallback for a missing lockfile.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPS = ("backend", "lexa-frontend")
ROOT_FIELDS = ("name", "version", "dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "engines")


class LockfileError(ValueError):
    pass


def parse_object(source: bytes | str, description: str) -> dict:
    try:
        value = json.loads(source)
    except (ValueError, UnicodeDecodeError) as error:
        raise LockfileError(f"Invalid JSON in {description}: {error}") from error
    if not isinstance(value, dict):
        raise LockfileError(f"{description} must be a JSON object")
    return value


def restore_committed_lock(app: str, cwd: Path = ROOT) -> bytes:
    """Recover the previous known-good lock from the current HEAD git tree.

    The ZIP importer replaces files but deliberately retains .git. Git objects
    remain available even when package-lock.json is excluded from the incoming ZIP.
    No npm registry request is made, and errors fail closed rather than upgrade.
    """
    file_path = f"{app}/package-lock.json"
    try:
        result = subprocess.run(
            ["git", "show", f"HEAD:{file_path}"], cwd=cwd,
            capture_output=True, check=False, timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise LockfileError(f"Cannot read the previous committed {file_path}: {error}") from error
    if result.returncode or not result.stdout:
        raise LockfileError(
            f"Cannot restore {file_path} from HEAD. Include the real, complete "
            "npm v3 package-lock.json in the incoming source ZIP; never generate "
            "a new lockfile from floating dependencies during CI."
        )
    return result.stdout


def verify_lock(app: str, package: dict, lock: dict) -> tuple[dict, bool]:
    """Verify package graph; allow ONLY an exact pin to an already locked version.

    Allows exact pins to previously locked versions and the removal of unused
    direct dependencies without fetching packages. An orphaned, unreferenced leaf
    (e.g. lucide-react) can be removed from the resolved graph; surviving package
    URLs, integrity hashes and transitive dependencies are never changed. New
    dependencies and version upgrades still require a reviewed committed lock.
    """
    packages = lock.get("packages")
    if lock.get("lockfileVersion") != 3 or not isinstance(packages, dict):
        raise LockfileError(f"{app}/package-lock.json must be a complete npm v3 lockfile")
    root = packages.get("")
    if not isinstance(root, dict) or len(packages) < 10:
        raise LockfileError(f"{app}/package-lock.json is incomplete")
    patched = False
    removed_direct: set[str] = set()
    for field in ROOT_FIELDS:
        expected, actual = package.get(field), root.get(field)
        if expected == actual:
            continue
        if field not in ("dependencies", "devDependencies") or not isinstance(expected, dict) or not isinstance(actual, dict):
            raise LockfileError(
                f"{app}/package-lock.json root {field} differs from package.json. "
                "Generate a complete matching lockfile in a trusted environment."
            )
        # Only an existing direct dependency can be removed. An addition cannot
        # be synthesized even if the old graph contains a dormant package entry.
        missing_in_committed = set(expected) - set(actual)
        if missing_in_committed:
            raise LockfileError(
                f"{app}/package-lock.json root {field} lacks requested dependencies "
                f"{sorted(missing_in_committed)}. Provide a newly generated lockfile."
            )
        for removed in set(actual) - set(expected):
            del actual[removed]
            removed_direct.add(removed)
            patched = True
        for dependency, target in expected.items():
            if target == actual.get(dependency):
                continue
            entry = packages.get(f"node_modules/{dependency}")
            if not isinstance(entry, dict) or target != entry.get("version") or not isinstance(target, str):
                raise LockfileError(
                    f"{app}: {dependency} requested {target!r}, but the committed lock "
                    f"does not contain that exact version. Provide a matching lockfile."
                )
            # Only the requested range was tightened, never the artifact itself.
            actual[dependency] = target
            patched = True
    # A removed direct dependency is pruned from the install graph only if it
    # is an unreferenced leaf with no children. This keeps all remaining
    # resolved versions, tarball URLs, integrity hashes and peer contracts.
    for removed in removed_direct:
        key = f"node_modules/{removed}"
        entry = packages.get(key)
        if not isinstance(entry, dict) or entry.get("dependencies") or entry.get("optionalDependencies"):
            continue
        mentioned_elsewhere = any(
            removed in other[field]
            for other_key, other in packages.items()
            if other_key != key and isinstance(other, dict)
            for field in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")
            if isinstance(other.get(field), dict)
        )
        if not mentioned_elsewhere:
            del packages[key]
            patched = True
    for field in ("dependencies", "devDependencies"):
        for name in package.get(field, {}):
            entry = packages.get(f"node_modules/{name}")
            if not isinstance(entry, dict) or not isinstance(entry.get("version"), str):
                raise LockfileError(f"{app}: missing resolved lockfile entry for {name}")
    if app == "lexa-frontend":
        react = packages.get("node_modules/@tanstack/react-query", {})
        core = packages.get("node_modules/@tanstack/query-core", {})
        pinned = package.get("dependencies", {}).get("@tanstack/react-query")
        if not isinstance(pinned, str) or not pinned[:1].isdigit():
            raise LockfileError("React Query must be pinned to an exact published version")
        if react.get("version") != pinned or core.get("version") != pinned:
            raise LockfileError(
                f"React Query / Query Core version mismatch: requested={pinned}, "
                f"react={react.get('version')}, core={core.get('version')}"
            )
        if react.get("dependencies", {}).get("@tanstack/query-core") != pinned:
            raise LockfileError("React Query transitive Query Core dependency must match the pinned release")
        for pkg, entry in (("react-query", react), ("query-core", core)):
            if not entry.get("resolved") or not entry.get("integrity"):
                raise LockfileError(f"Missing verified tarball information for {pkg}")
    return lock, patched


def prepare(root: Path = ROOT) -> None:
    for app in APPS:
        p = root / app / "package.json"
        l = root / app / "package-lock.json"
        if not p.is_file():
            raise LockfileError(f"Missing {app}/package.json")
        package = parse_object(p.read_bytes(), str(p))
        restored = False
        if not l.is_file():
            source = restore_committed_lock(app, root)
            lock = parse_object(source, f"committed {app}/package-lock.json")
            restored = True
        else:
            lock = parse_object(l.read_bytes(), str(l))
        lock, normalized = verify_lock(app, package, lock)
        if restored or normalized:
            l.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Dependency lock verified: {app} ({len(lock['packages'])} resolved entries; "
              f"restored from git: {restored}; exact-pin normalization: {normalized}).")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check existing locks without any writes")
    args = parser.parse_args()
    try:
        if not args.check:
            prepare()
        else:
            for app in APPS:
                folder = ROOT / app
                package = parse_object((folder / "package.json").read_bytes(), f"{app}/package.json")
                lock = parse_object((folder / "package-lock.json").read_bytes(), f"{app}/package-lock.json")
                _, patched = verify_lock(app, package, lock)
                if patched:
                    raise LockfileError(f"{app} lockfile is not normalized")
                print(f"Dependency lock verified: {app}")
    except (LockfileError, OSError) as error:
        parser.exit(status=1, message=f"Dependency lock preflight failed: {error}\n")


if __name__ == "__main__":
    main()
