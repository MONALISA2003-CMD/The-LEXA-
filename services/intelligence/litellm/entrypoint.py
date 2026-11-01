"""Build a provider router from only the provider keys actually configured.

This avoids selecting an unconfigured provider and makes an AI-less Render
workspace start safely. Provider deployments are never mixed between the paid
business alias and the public-help alias.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Mapping, Any

import yaml

CONFIG = Path(__file__).with_name("config.yaml")


def _env_key(reference: str) -> str | None:
    prefix = "os.environ/"
    if reference.startswith(prefix):
        return reference[len(prefix):]
    return None


def build_config(environ: Mapping[str, str] | None = None) -> dict[str, Any]:
    """Return an allowlisted config containing deployments with real credentials."""
    env = os.environ if environ is None else environ
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    deployments = []
    for deployment in config.get("model_list", []):
        params = deployment.get("litellm_params", {})
        key_name = _env_key(str(params.get("api_key", "")))
        # Remove a provider deployment unless its own credential is available.
        if key_name and env.get(key_name, "").strip():
            if key_name == "HF_TOKEN" and env.get("LEXA_AI_HF_ENABLED", "false").lower() != "true":
                continue
            deployments.append(deployment)
    config["model_list"] = deployments

    if not deployments:
        # LiteLLM expects a model entry for some proxy code paths. This sentinel
        # is not exposed by LEXA and cannot reach any external provider.
        config["model_list"] = [{
            "model_name": "lexa-unconfigured",
            "litellm_params": {
                "model": "openai/gpt-6-luna",
                "api_base": "http://127.0.0.1:9/v1",
                "api_key": "not-a-real-provider-key",
            },
        }]
    return config


def main() -> None:
    config = build_config()
    handle, temp_path = tempfile.mkstemp(prefix="lexa-litellm-", suffix=".yaml")
    with os.fdopen(handle, "w", encoding="utf-8") as output:
        yaml.safe_dump(config, output, sort_keys=False)
    executable = shutil.which("litellm")
    if not executable:
        raise RuntimeError("LiteLLM proxy executable is not installed.")
    os.execv(executable, [executable, "--config", temp_path, "--host", "0.0.0.0", "--port", "4000"])


if __name__ == "__main__":
    main()
