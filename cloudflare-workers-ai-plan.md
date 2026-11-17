# Cloudflare Workers AI Provider Plan (Grade AI)

## Goal
Add Cloudflare Workers AI as a first-class inference provider for Grade AI (`/grade-ai/chat`), integrated via the Cloudflare-recommended SDK path and aligned with the existing `InferenceProvider` + NDJSON streaming architecture.

## Research summary (checked 2026-11-17)

- **Models & APIs**
  - Workers AI text models use `@cf/...` IDs (e.g. `@cf/meta/llama-3.1-8b-instruct`, GPT-OSS variants) and are available via Workers AI/AI Gateway.
  - **OpenAI-compatible REST:** `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions` (and `/v1/embeddings`), Bearer token auth, OpenAI chat-completions shape; most text models supported (Responses API limited to GPT-OSS, non-streaming). Docs: [OpenAI compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/), [REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/).
  - **Workers binding (native):** `[ai] binding = "AI"` + `env.AI.run(model, input, { gateway: { id, skipCache, cacheTtl, ... } })`; can route through AI Gateway (logging/caching/rate limits/unified billing). Docs: [Workers bindings](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/), [Setup](https://developers.cloudflare.com/ai-gateway/integrations/aig-workers-ai-binding/).

- **SDK guidance**
  - `workers-ai-provider` is **deprecated**. Cloudflare docs recommend `createAI` from `agents/models/ai-sdk` with Vercel AI SDK v7 for Workers AI (`ai@^7`, `@ai-sdk/provider@^4`). Docs: [Vercel AI SDK / Workers AI](https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/), [Agents models](https://developers.cloudflare.com/agents/models/).
  - Alternative (not chosen as primary): existing `openai` SDK against the OpenAI-compatible base URL; useful fallback with minimal new deps.

- **Capability/behavior notes**
  - Feature parity varies by `@cf/*` model (tool/function calling, reasoning tokens, streaming/usage details, context limits). Current providers have bespoke flows (Groq: function-tool web search + Tavily fallback; Gemini: Google Search grounding + image-marker/Tavily phase) that cannot be assumed equivalent on Workers AI without per-model validation.

## Chosen approach

**Primary:** `agents` + Vercel AI SDK (`createAI` from `agents/models/ai-sdk`) over the Workers `AI` binding.
- Fits a Cloudflare Worker deployment, avoids embedding provider API keys for Workers AI models (subject to account gateway/billing setup), and follows current Cloudflare guidance.
- Requires adapting AI SDK stream output into the app’s `StreamChunk`/NDJSON protocol.

**Fallback:** OpenAI-compatible REST via `openai@^6` (`baseURL` = account `/ai/v1`) if binding/SDK stream mapping or account constraints block the primary path.

## Current architecture touchpoints

- Provider contract & stream types: `src/routes/grade-ai/routes/providers/types.ts` (`InferenceProvider`, `StreamChunk`, `ChatRequestBody.provider`)
- Implementations: `src/routes/grade-ai/routes/providers/groq-provider.ts`, `gemini-provider.ts`, `provider-factory.ts`
- Request/stream pipeline: `src/routes/grade-ai/routes/chat-handler.ts` (quota, Convex persistence/refund, NDJSON), `src/utils/stream-utils.ts`
- Prompt/context: `src/routes/grade-ai/utils/buildMessage.ts`, `src/routes/grade-ai/routes/prompts/system-prompts.ts`
- Validation & registry: `src/zodSchema.ts` (`chatRequestSchema`), `src/routes/grade-ai/utils/modelList.ts` (`modelList`, `ALLOWED_CHAT_MODELS`)
- Routing/API surface: `src/routes/grade-ai/index.ts` (`POST /chat`, `GET /model-list`)
- Config/types: `wrangler.toml`, `worker-configuration.d.ts`, `package.json`, `README.md`

## Implementation plan

### 1. Dependencies and Worker configuration
- Add packages (verify compatible majors per docs): `agents`, `ai@^7`, `@ai-sdk/provider@^4`.
  - `bun add agents ai @ai-sdk/provider`
- Update `wrangler.toml`:
  ```toml
  [ai]
  binding = "AI"
  ```
- Regenerate/sync Worker env types so bindings include `AI: Ai` (e.g. `worker-configuration.d.ts` / project typegen flow); extend `Cloudflare.Env`/`Bindings` usage as needed.
- Confirm account prerequisites: Workers AI enabled, AI Gateway/default gateway (or chosen gateway `id`) and billing/credits mode as required for the selected models.

### 2. Domain/types and validation
- `src/routes/grade-ai/routes/providers/types.ts`
  - Extend provider union: `"groq" | "gemini" | "cloudflare"` (name finalizable: `cloudflare` vs `workers-ai`, keep consistent repo-wide).
  - Keep `InferenceProvider.stream(messages, model): AsyncIterable<StreamChunk>` stable.
- `src/routes/grade-ai/utils/modelList.ts`
  - Extend `ModelList.providerName` union.
  - Add curated Cloudflare entries (initial allowlist), e.g. vetted `@cf/...` chat models with `modelString`, display name, description.
  - `ALLOWED_CHAT_MODELS` remains the single source of truth for model→provider validation.
- `src/zodSchema.ts`
  - Extend `provider` enum to include the new provider.
  - Rely on existing `superRefine` to reject unknown models and provider/model mismatches.
- `src/routes/grade-ai/index.ts` / `README.md` endpoint notes: no contract change required beyond new valid provider/model values in `POST /grade-ai/chat` and updated `GET /grade-ai/model-list` output.

### 3. Provider implementation (SDK-backed)
- Create `src/routes/grade-ai/routes/providers/cloudflare-provider.ts` implementing `InferenceProvider`.
  - Constructor accepts `env.AI` (and optional gateway options such as `id`, `skipCache`, `cacheTtl` if exposed).
  - Initialize: `const ai = createAI({ binding: env.AI /*, id: gatewayId */ });`
  - `stream(messages, model)`:
    - Map internal `ChatMessage[]` to AI SDK message/input format (preserve system/user/assistant roles; handle provider-agnostic content).
    - Invoke `streamText({ model: ai(model as "@cf/..."), messages, maxOutputTokens: MAX_OUTPUT_TOKENS })` (align cap with existing providers).
    - Consume the AI SDK stream (`fullStream`/parts as appropriate) and emit normalized `StreamChunk`s:
      - text delta → `{ type: "delta", delta }`
      - reasoning/thinking (only if model/SDK exposes it) → `{ type: "thinking", thinking }`
      - finish/usage → `{ type: "usage", usage: { promptTokens, completionTokens, totalTokens } }` (map SDK usage fields; guard missing values)
      - length/max-tokens finish → `{ type: "warning", message: RESPONSE_TRUNCATED_MESSAGE }`
      - errors → `{ type: "error", message: toUserFacingError(err, "inference") }` (never leak raw provider errors/keys)
- **MVP scope:** streaming chat + usage + truncation warning parity. **Out of scope (initial):** Groq function-tool web search loop and Gemini grounding/image-marker flows; document that Cloudflare-backed models start without those provider-specific augmentations unless explicitly implemented for compatible models.

### 4. Factory and handler wiring
- `src/routes/grade-ai/routes/providers/provider-factory.ts`
  - Extend env parameter/type to include `AI` (and any Cloudflare config if added).
  - Branch: `case "cloudflare"` → `new CloudflareProvider(...)`.
  - Preserve defense-in-depth: reject unknown/unsupported models and provider/model mismatches via `ALLOWED_CHAT_MODELS` before construction/use.
- `src/routes/grade-ai/routes/chat-handler.ts`
  - Pass required binding/env into `resolveProvider`.
  - No behavioral changes to quota reserve/refund, Convex reads/writes, context truncation, NDJSON framing, or hard-error persistence (handler remains `StreamChunk`-generic).

### 5. Prompting and context
- `src/routes/grade-ai/utils/buildMessage.ts` / `getSystemPrompt(...)`: keep behavior unless a Cloudflare-specific system prompt variant is required; if added, thread provider through consistently and test Socratic/Direct modes.

### 6. Verification
- **Static checks:** project typecheck/lint/build for Workers (per repo scripts/config).
- **Functional checks (manual/integration):**
  - `GET /grade-ai/model-list` includes Cloudflare models with correct provider.
  - `POST /grade-ai/chat` with a selected `@cf/*` model streams deltas, emits terminal usage/done semantics as expected by the client, handles truncation warning, and persists messages.
  - Error paths refund quota / persist failure state as today; invalid model/provider pairs rejected by validation.
- **Model validation:** confirm each exposed `@cf/*` model supports streaming chat completions in this account and behaves acceptably (latency, context, no unsupported params).

### 7. Documentation and rollout
- `README.md`: document new provider, example `@cf/*` models, `[ai]` binding, and any gateway/billing/token prerequisites; update endpoint description from "Groq & Gemini" to include Cloudflare.
- Update `worker-configuration.d.ts`/env docs for new binding; if fallback REST path is later used, document `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, optional gateway id.
- Consider adding model capability metadata (tools/reasoning/vision) in a follow-up if the UI needs to branch behavior.

## Risks and open decisions

- **SDK stream mapping:** AI SDK part/usage/finish-reason names and availability differ by version/model; normalize defensively and test against chosen models.
- **Feature gaps vs existing providers:** no web search/grounding parity by default; decide whether/when to add tool support for specific `@cf/*` models.
- **Auth/billing:** binding + gateway may require unified billing/prepaid credits or specific gateway config for some models; confirm in target account.
- **Type generation:** ensure `AI` binding types are present after config changes to avoid runtime/type drift.
- **Fallback trigger:** if `createAI`/binding path cannot produce required stream semantics reliably, implement `CloudflareProvider` against OpenAI-compatible REST using the existing `openai` dependency with the same `InferenceProvider` contract.

## Acceptance criteria

- A curated set of Cloudflare Workers AI models is selectable via `GET /grade-ai/model-list` and accepted by `POST /grade-ai/chat` validation.
- Chat requests to those models stream correctly through the existing NDJSON pipeline, with usage/truncation handling and unchanged quota/persistence guarantees.
- Configuration, types, and README reflect the new provider and its prerequisites.
- Implementation uses the SDK-based approach (`agents/models/ai-sdk` + `AI` binding) unless an explicitly documented fallback is required.
