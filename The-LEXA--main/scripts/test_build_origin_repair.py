from pathlib import Path
import importlib.util
import tempfile

script = Path(__file__).resolve().parents[1] / "lexa-frontend/scripts/fix_build_origin.py"
spec = importlib.util.spec_from_file_location("fix_build_origin", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

config_source = "import { defineConfig } from 'vitest/config';\nexport default defineConfig({\n  test: {\n    environment: 'jsdom',\n  },\n});\n"
report_source = "  const contacts = rows('contacts');\n"
config = module.repair_config(config_source)
report = module.repair_reports(report_source)
assert "include: ['src/**/*.test.{ts,tsx}']" in config
assert "const contacts = source['contacts'] ?? [];" in report
assert module.repair_config(config) == config
assert module.repair_reports(report) == report
print("Build-origin repair fixture checks passed.")
