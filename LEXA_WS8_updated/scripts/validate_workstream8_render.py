from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
BLUEPRINT = ROOT / "render.yaml"


def main() -> None:
    data = yaml.safe_load(BLUEPRINT.read_text(encoding="utf-8"))
    groups = {item["name"]: item for item in data.get("envVarGroups", [])}
    assert "lexa-ai-provider-keys" in groups, "provider environment group is missing"
    assert groups["lexa-ai-provider-keys"].get("envVars") == [], "provider group must remain empty in source"

    services = {item["name"]: item for item in data.get("services", [])}
    assert len(services) == len(data.get("services", [])), "service names must be unique"
    assert services["lexa-litellm"]["type"] == "pserv"
    assert services["lexa-intelligence"]["type"] == "pserv"
    assert services["lexa-backend-api-live"]["type"] == "web"

    gateway_vars = services["lexa-litellm"].get("envVars", [])
    assert {item.get("fromGroup") for item in gateway_vars if "fromGroup" in item} == {"lexa-ai-provider-keys"}
    intelligence_vars = {item.get("key"): item for item in services["lexa-intelligence"].get("envVars", [])}
    assert intelligence_vars["LEXA_AI_PUBLIC_HELP_CONFIGURED"].get("value") == "false"
    assert intelligence_vars["LEXA_AI_BUSINESS_CONFIGURED"].get("value") == "false"

    content = BLUEPRINT.read_text(encoding="utf-8")
    forbidden_markers = ("".join(("sk", "-proj-")), "".join(("sk", "-or-v1-")), "".join(("gs", "k_")), "".join(("cs", "k-")), "".join(("nva", "pi-")), "".join(("AI", "za")), "".join(("A", "Q.")))
    assert not any(marker in content for marker in forbidden_markers), "secret-like literal detected in render.yaml"
    assert not any(item.get("sync") is False for item in groups["lexa-ai-provider-keys"].get("envVars", []))
    print("Render Blueprint validation passed: private services, empty secret group, safe readiness defaults, and no secret literals.")


if __name__ == "__main__":
    main()
