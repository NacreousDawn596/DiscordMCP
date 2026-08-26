# Discord Agent

An **autonomous AI agent that lives inside Discord**. Mention it, ask it in plain
language, and it inspects the server, plans multi-step actions, executes them
through Discord API tools, verifies the result, and reports back — as a real
administrator would.

It is **multi-guild by design**: every operation is hard-scoped to the guild
where it was invoked, with no possibility of mixing context, memory, or
permissions across servers.

```
User:  @Agent create a Development category with frontend, backend, devops,
       and code-review channels, plus a Dev role that can access them.
Agent: Done. Created the Development category with 4 channels and the Dev role,
       and configured permissions. Everything verified.
```

## Features

- **Autonomous planning & execution** — users describe *goals*, not API calls.
- **LLM-agnostic** — OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Ollama, or any OpenAI-compatible endpoint.
- **Multi-guild isolation** — every query, cache entry, and memory record is namespaced by guild.
- **MCP-style tool layer** — `discord.guild.*`, `discord.channel.*`, `discord.role.*`, `discord.permission.*`, `discord.message.*`, `discord.member.*`, `discord.moderation.*`, `discord.thread.*`, `discord.forum.*`, `discord.search.*`, `discord.audit.*`, `discord.analytics.*`, `discord.memory.*`, `discord.automation.*`, `discord.schedule.*`, `discord.server.*`, `discord.bulk.*`.
- **Permission intelligence** — explains *why* a member can or cannot act.
- **Safety gates** — risk classification, configurable confirmation levels, dry-run/plan mode, idempotent `ensure_*` operations, authorization independent of the LLM.
- **Prompt-injection resistance** — all Discord content is treated as untrusted; rules and guild boundaries cannot be overridden.
- **Guild-scoped memory** — "remember that …", "forget that …", "what do you remember?".
- **Event automations & scheduled tasks** — welcome messages, reactions, weekly summaries.
- **Audit trail** — structured run/action history per guild.
- **CLI diagnostics** — `agent doctor`, `agent status`, `agent guilds`, `agent capabilities`, `agent test`.

## Quick start

### 1. Create a Discord application

1. Go to <https://discord.com/developers/applications> and create a **New Application**.
2. Under **Bot**, create a bot and copy the **token**.
3. Enable the required **Privileged Gateway Intents**:
   - `Server Members Intent`
   - `Message Content Intent`
4. Use the **OAuth2 → URL Generator** to invite the bot with `bot` scope and the
   permissions it needs (e.g. `Manage Channels`, `Manage Roles`, `Manage Messages`).
   The bot will only ever do what its Discord permissions allow.

### 2. Configure

```bash
cp .env.example .env
# edit .env and set at minimum:
#   DISCORD_BOT_TOKEN=
#   LLM_PROVIDER=openai
#   LLM_API_KEY=
#   LLM_MODEL=gpt-4o-mini
```

### 3. Run

**Docker:**

```bash
docker compose up --build
```

**Local development:**

```bash
npm install
npm run dev
```

**Production build:**

```bash
npm run build
npm start
```

### 4. Use it

Mention the bot in any channel:

```
@Agent organize this server
@Agent create a private staff section
@Agent why can't John send messages in #general?
@Agent audit the server permissions
@Agent remember that release channels should always be read-only
```

Prefix a request with `plan` / `preview` / `dry-run` to get a plan without
executing, or with `audit` / `analyze` for read-only analysis.

## Commands & diagnostics

```bash
npm run cli -- doctor         # environment + configuration health check
npm run cli -- status         # configuration summary
npm run cli -- guilds         # list known guilds
npm run cli -- capabilities   # list all tools by namespace and risk
npm run cli -- config         # show resolved config (secrets redacted)
npm run cli -- test           # quick self-test
```

## Configuration

See [`.env.example`](./.env.example) for the full list. Key settings:

| Variable | Description |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Bot token (required). |
| `LLM_PROVIDER` | `openai`, `anthropic`, `gemini`, `openrouter`, `ollama`, `deepseek`, `custom`. |
| `LLM_API_KEY` / `LLM_MODEL` / `LLM_BASE_URL` | Model selection and endpoint. |
| `AGENT_CONFIRMATION_LEVEL` | Risk threshold for required confirmation (`HIGH` default). |
| `ENABLE_MODERATION` | Gate destructive moderation tools. |
| `ALLOWED_USER_IDS` | Comma-separated user IDs that bypass guild-level authorization. |

## Architecture

```
Discord ── message/mention/interaction ──► Discord Agent
                                            ├── Context Manager
                                            ├── LLM / Agent Runtime (tool loop)
                                            ├── Memory (guild-scoped)
                                            ├── Planner + validation
                                            ├── Permission awareness
                                            ├── MCP Tool Layer
                                            └── Execution Engine ──► Discord API
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/CONFIGURATION.md](./docs/CONFIGURATION.md),
[docs/SECURITY.md](./docs/SECURITY.md), and [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for details.
For ready-to-use example prompts and provider configs, see [examples/](./examples).

## Testing

```bash
npm test
```

Unit tests cover guild isolation, authorization, permission calculation, risk
classification, memory isolation, tool validation, plan validation, and prompt
injection defenses.

## Security

The bot has immutable boundaries: it never exposes its token, never bypasses
Discord permissions, never crosses guild boundaries, never lets message content
override policy, never authorizes privileged actions from unauthorized users,
and never claims success without verifying state. See [docs/SECURITY.md](./docs/SECURITY.md).

## License

MIT
