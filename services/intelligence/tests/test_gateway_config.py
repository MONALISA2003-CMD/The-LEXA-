from __future__ import annotations

import unittest
from unittest.mock import patch

from services.intelligence.litellm import entrypoint


class GatewayConfigTests(unittest.TestCase):
    def deployment_names(self, config: dict) -> set[str]:
        return {item["model_name"] for item in config["model_list"]}

    def test_no_credentials_exposes_no_provider_alias(self) -> None:
        config = entrypoint.build_config({})
        self.assertEqual(self.deployment_names(config), {"lexa-unconfigured"})

    def test_free_providers_never_enable_paid_business_alias(self) -> None:
        config = entrypoint.build_config({"GROQ_API_KEY": "groq-key", "OPENROUTER_API_KEY": "router-key"})
        self.assertEqual(self.deployment_names(config), {"lexa-public-help"})

    def test_paid_provider_keys_do_not_enable_public_help(self) -> None:
        config = entrypoint.build_config({"GEMINI_API_KEY": "paid-gemini", "OPENAI_API_KEY": "openai"})
        self.assertEqual(self.deployment_names(config), {"lexa-business-paid"})

    def test_hugging_face_is_omitted_until_explicitly_enabled(self) -> None:
        off = entrypoint.build_config({"HF_TOKEN": "hf-key"})
        on = entrypoint.build_config({"HF_TOKEN": "hf-key", "LEXA_AI_HF_ENABLED": "true"})
        off_models = [item["litellm_params"]["model"] for item in off["model_list"]]
        on_models = [item["litellm_params"]["model"] for item in on["model_list"]]
        self.assertNotIn("huggingface/Qwen/Qwen3-8B", off_models)
        self.assertIn("huggingface/Qwen/Qwen3-8B", on_models)

    def test_paid_and_public_aliases_remain_separate_when_both_pools_are_configured(self) -> None:
        config = entrypoint.build_config({
            "GEMINI_API_KEY": "paid-gemini", "OPENAI_API_KEY": "openai",
            "GEMINI_FREE_API_KEY": "free-gemini", "GROQ_API_KEY": "groq",
            "CEREBRAS_API_KEY": "cerebras", "OPENROUTER_API_KEY": "router",
        })
        self.assertEqual(self.deployment_names(config), {"lexa-business-paid", "lexa-public-help"})
        public_models = {item["litellm_params"]["model"] for item in config["model_list"] if item["model_name"] == "lexa-public-help"}
        self.assertTrue(all(model.endswith(":free") for model in public_models if model.startswith("openrouter/")))
        self.assertFalse(any("openai/gpt-6-luna" in model for model in public_models))


if __name__ == "__main__":
    unittest.main()
