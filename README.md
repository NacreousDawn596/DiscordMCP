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
| `LLM_API_KEY` / `LLM_MODEL` / `LLM_BASE_URL` | Model selection and endpoint (`LLM_MODEL` accepts a comma-separated fallback list). |
| `AGENT_CONFIRMATION_LEVEL` | Risk threshold for required confirmation (`HIGH` default). |
| `ENABLE_MODERATION` | Gate destructive moderation tools. |
| `ALLOWED_USER_IDS` | Comma-separated user IDs that bypass guild-level authorization. |

## Connect to OpenCode (MCP)

Yes — the `discord.*` tool suite can be exposed to **opencode** (or any MCP
client: Claude Code, Cursor, etc.) as a real Model Context Protocol server over
stdio. When connected, you can drive your Discord server from prompts like:

```
use the discord-agent tools to create a "Development" category with
#frontend, #backend and #devops in guild 123456789
```

### How it works

The MCP server (`npm run mcp`) boots the same Discord bot, logs in with your
token, and serves all 124 tools over stdin/stdout. Each tool takes an optional
`guild_id` so the same server can manage every guild the bot is in.

> **Important:** MCP calls run as the **bot itself** (admin context), scoped to
> whatever the bot can actually do. Destructive moderation (ban/kick/purge)
> still requires `ENABLE_MODERATION=true`. There is no interactive confirmation
> channel over MCP, so actions run immediately.

### Step 1 — Build (or run with tsx)

```bash
npm install
npm run build        # produces dist/mcp/entry.js
```

### Step 2 — Configure opencode

Add an `mcp` entry to your opencode config. This can be the project config
(`opencode.json`) or your global config (`~/.config/opencode/opencode.json`).

**Option A — rely on the project `.env` (recommended):**

```jsonc
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "discord-agent": {
      "type": "local",
      "command": ["node", "dist/mcp/entry.js"],
      "cwd": "/absolute/path/to/discord-agent",
      "enabled": true,
      "timeout": 30000
    }
  }
}
```

Set `cwd` to the project directory so the server loads your `.env` (which holds
`DISCORD_BOT_TOKEN` and, optionally, `MCP_DEFAULT_GUILD_ID`).

**Option B — pass the token explicitly (no `.env` needed):**

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "discord-agent": {
      "type": "local",
      "command": ["node", "dist/mcp/entry.js"],
      "cwd": "/absolute/path/to/discord-agent",
      "environment": {
        "DISCORD_BOT_TOKEN": "your-bot-token",
        "MCP_DEFAULT_GUILD_ID": "123456789"
      },
      "enabled": true,
      "timeout": 30000
    }
  }
}
```

> Set `timeout` above the default 5s — the server logs the bot into Discord
> before answering, which can take a few seconds.

**Dev (no build):** use `"command": ["npx", "tsx", "src/mcp/entry.ts"]`.

### Step 3 — Restart opencode

Restart opencode so it picks up the new MCP server. You can verify the
connection with `/mcp` (or by asking: `list the discord-agent tools`).

### Step 4 — Use it

Every tool is prefixed `discord_`. Examples:

```
create a #welcome channel in guild 123456789 using discord-agent
list the roles in guild 123456789
audit the permissions in guild 123456789
```

If `MCP_DEFAULT_GUILD_ID` is set (or the bot is in exactly one guild), you can
omit `guild_id`:

```
using discord-agent, create a Development category with #frontend and #backend
```

### MCP options

| Option | Purpose |
| --- | --- |
| `MCP_DEFAULT_GUILD_ID` | Default guild when a tool call omits `guild_id`. |
| `guild_id` (tool arg) | Target guild for a specific call; overrides the default. |

See [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for the full tool catalog
and `npm run cli -- capabilities` for the live list.

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
