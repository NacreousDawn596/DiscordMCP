# Deployment

## Discord setup checklist

1. Create an application at <https://discord.com/developers/applications>.
2. Create a bot, copy the token, and set it as `DISCORD_BOT_TOKEN`.
3. Enable privileged gateway intents:
   - **Server Members Intent**
   - **Message Content Intent**
4. Invite the bot with an OAuth2 URL that grants the permissions it needs, for
   example:
   - `Manage Channels`
   - `Manage Roles`
   - `Manage Messages`
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Kick Members` / `Ban Members` (only if moderation is enabled)

## Environment

Copy `.env.example` to `.env` and configure at minimum:

```
DISCORD_BOT_TOKEN=
LLM_PROVIDER=openai
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
```

Set `AGENT_CONFIRMATION_LEVEL=HIGH` and `ENABLE_MODERATION=false` unless you
explicitly want destructive tools available.

## Docker

```bash
docker compose up --build -d
```

The SQLite database is persisted in the `agent-data` volume at
`/app/data/agent.sqlite`. To run multiple replicas, migrate the database to a
shared store (the schema is plain SQL and straightforward to port to Postgres).

## Local development

```bash
npm install
npm run dev          # tsx watch
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

## Provider notes

| Provider | `LLM_PROVIDER` | `LLM_BASE_URL` (optional) |
| --- | --- | --- |
| OpenAI | `openai` | — |
| Anthropic | `anthropic` | — |
| Google Gemini | `gemini` | — |
| OpenRouter | `openrouter` | auto |
| DeepSeek | `deepseek` | auto |
| Ollama | `ollama` | `http://localhost:11434/v1` |
| Any OpenAI-compatible | `custom` | required |

## Health check

```bash
npm run cli -- doctor
```

Expected output shows green checks for the Discord token, LLM provider, API key,
database, and MCP tools. Use `npm run cli -- guilds` to inspect known guilds and
`npm run cli -- capabilities` to review the tool surface.

## Operations

- **Logs** are structured JSON (pino). Set `LOG_LEVEL=debug` for verbose tracing;
  secrets are redacted.
- **Retention** — `MESSAGE_RETENTION_DAYS` controls conversation-history
  retention intent (context is trimmed per request regardless).
- **Rate limiting** — the Discord client respects API rate limits automatically;
  destructive actions are never blindly retried.
