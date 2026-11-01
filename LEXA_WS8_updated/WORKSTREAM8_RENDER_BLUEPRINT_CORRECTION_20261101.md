# LEXA Workstream 8 — Render Blueprint correction package

## Non-secret corrections included

1. `render.yaml` now defines `lexa-ai-provider-keys` as an empty environment-variable group and links it only to the private `lexa-litellm` service. The provider values are not in this package. Add them in Render's Environment Groups page after the first Blueprint sync; `sync: false` entries inside a Render environment group are not supported.
2. The Blueprint creates `lexa-litellm` and `lexa-intelligence` as private Docker services in Frankfurt, generates internal service tokens, and adopts the existing `lexa-backend-api-live` service by its exact name.
3. `LEXA_AI_PUBLIC_HELP_CONFIGURED` and `LEXA_AI_BUSINESS_CONFIGURED` are both explicitly false on initial deployment. Only turn a flag on after the corresponding model alias is present and a real smoke test succeeds.
4. NVIDIA NIM is added to the public LEXA product-help pool, using LiteLLM's required `NVIDIA_NIM_API_KEY` variable name. No tenant business records, finance, CRM or HR aggregates route to NVIDIA or any other public/free provider.
5. Removed an unverified Cerebras model entry. The verified Cerebras Qwen candidate remains. OpenRouter uses the documented `openai/gpt-oss-20b:free` model ID. The OpenAI paid candidate is `openai/gpt-6-luna`.
6. Added a Render activation runbook, a Blueprint validator, updated provider configuration examples and tests. The frontend already contains the `/intelligence` page, the dashboard Quick Access entry and application-shell navigation; it consumes readiness from the backend and does not receive provider keys.

## Local validation performed for this correction

- Python Intelligence tests: **13 passed, 0 failed**.
- Python compilation: passed.
- Render and LiteLLM YAML parsing: passed.
- `scripts/validate_workstream8_render.py`: passed; verifies private service types, service names, empty group, readiness flags default false and no secret literals in `render.yaml`.
- Secret-pattern scan across the packaged source: no provider key strings detected.

## Not completed / not claimed

- No Render environment group or private service has been created by this package operation.
- No provider credentials have been written to Render, GitHub, or this ZIP.
- The Blueprint has not been synced and no service has been deployed.
- Live provider model calls and the Workstream 8 Neon migration have not been run.
- Vercel's current `lexa_review` production deployment for commit `68d48284ac8231a1a69ded9bd31434ab2e0f96cb` is in `ERROR` with `lint_or_type_error` (`npm run build` exited with 2). A successful Vite production build is still required before claiming frontend AI responses are live.

The full package includes the previous Workstream 7 repair baseline and Workstream 8 implementation source, not only the changed files. Never commit or upload actual provider credentials from a local `.env` file.
