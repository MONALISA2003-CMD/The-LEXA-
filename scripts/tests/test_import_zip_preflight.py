"""Regression checks for the import failure in GitHub Actions #149."""
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from preflight_import_zip import REQUIRED, problems


class ImportPreflightTests(unittest.TestCase):
    def zip_with(self, names):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        archive = Path(temp.name) / 'source.zip'
        with ZipFile(archive, 'w', compression=ZIP_DEFLATED) as z:
            for name in sorted(set(REQUIRED) | set(names)):
                z.writestr(name, b'test-data')
            # Required files include one source file for each of four folders.
            z.writestr('scripts/preflight_import_zip.py', b'test-data')
        return archive

    def test_allowed_canonical_source_passes(self):
        problems_list, count = problems(self.zip_with(['lexa-frontend/marketing/index.html']))
        self.assertEqual(problems_list, [])
        self.assertGreater(count, 5)

    def test_preflight_detects_missing_demo_backup_disposition(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        archive = Path(temp.name) / 'bad-demo.zip'
        with ZipFile(archive, 'w', compression=ZIP_DEFLATED) as z:
            for name in sorted(REQUIRED):
                z.writestr(name, b'test-data')
            z.writestr('backend/backup/authoritative-inventory.json', b'[]')
            z.writestr('backend/prisma/migrations/20261111100000_isolated_demo_sessions/migration.sql', b'CREATE TABLE demo_sessions (id uuid);')
        errors, _ = problems(archive)
        self.assertTrue(any('Backup inventory missing tables: demo_sessions' in e for e in errors), errors)

    def test_preflight_requires_demo_bundle_builder(self):
        errors, _ = problems(self.zip_with(['backend/src/demo/demo-session.service.ts']))
        self.assertTrue(any('Missing demo release prerequisite: scripts/build_demo_vercel_bundle.py' in e for e in errors))

    def test_unexpected_root_release_notes_rejected(self):
        errs, _ = problems(self.zip_with(['LEXA_DEMO_RELEASE_NOTES.md']))
        self.assertTrue(any('Unexpected root-level file' in e for e in errs))

    def test_unexpected_root_demo_yaml_rejected(self):
        errs, _ = problems(self.zip_with(['render.demo.yaml']))
        self.assertTrue(any('Unexpected root-level file' in e for e in errs))

    def test_unexpected_root_vercel_json_rejected(self):
        errs, _ = problems(self.zip_with(['vercel.json']))
        self.assertTrue(any('Unexpected root-level file' in e for e in errs))

    def test_top_level_marketing_dir_rejected(self):
        errs, _ = problems(self.zip_with(['marketing/index.html']))
        self.assertTrue(any('Unexpected top-level directory' in e for e in errs))

    def test_zip_traversal_rejected(self):
        errs, _ = problems(self.zip_with(['docs/../outside.txt']))
        self.assertTrue(any('Unsafe ZIP path' in e for e in errs))

    def test_archive_cannot_contain_workflows(self):
        errs, _ = problems(self.zip_with(['.github/workflows/repository-import.yml']))
        self.assertTrue(any('Do not include .github' in e for e in errs))


if __name__ == '__main__':
    unittest.main()
