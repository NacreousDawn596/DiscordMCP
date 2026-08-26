# Architecture

## Overview

The agent is a single Node.js process that holds a Discord gateway connection and
an LLM-driven, tool-using runtime. It has no external dashboard — Discord is the
primary interface.

```
Discord gateway
   │  message / mention / interaction
   ▼
┌──────────────────────────────────────────────┐
│ DiscordAgent (src/app.ts)                     │
│   ├── Context Manager      (src/agent/context) │
│   ├── Agent Runtime        (src/agent/runtime) │
│   │     └── tool loop                          │
│   ├── Planner              (src/agent/planner) │
│   ├── Memory               (src/agent/memory)  │
│   ├── Policies             (src/agent/policies)│
│   ├── MCP Tool Layer       (src/mcp)           │
│   └── Execution Engine                        │
├──────────────────────────────────────────────┤
│ LLM Provider abstraction (src/llm)            │
├──────────────────────────────────────────────┤
│ SQLite database (src/database)                │
│   guilds, guild_config, guild_memory, ...     │
└──────────────────────────────────────────────┘
   │  tool calls
   ▼
Discord API
```

## Request flow

1. A `messageCreate` or `interactionCreate` event is captured.
2. The message is only handled when it mentions the bot or replies to it (or is
   a confirmation reply / button).
3. `ContextManager` builds an immutable `ExecutionContext`:
   `{ guildId, guildName, channelId, userId, botId, ... }` plus live Discord objects.
4. The runtime loads guild config, guild-scoped memory, and recent (untrusted)
   channel messages.
5. The agent loop calls the LLM with tool definitions and iterates:
   `understand → plan → select tool → execute → observe → reason → next tool`.
6. Each tool call goes through the **executor**, which enforces — in code — the
   effective permission chain before any Discord mutation.
7. Results are recorded in `agent_runs` / `agent_actions` and reported back.

## Effective permission chain

Every tool call is gated by **all** of:

```
Discord permission  AND  Agent capability  AND  User authorization  AND  Safety policy
```

- **Discord permission** — the bot must hold the Discord permission bits for the
  operation (`botHasCapability`).
- **Agent capability** — the capability must be enabled in the guild config
  (`enabled_capabilities`).
- **User authorization** — the invoking user must be permitted to perform the
  action themselves: the user holds the effective (channel-scoped) Discord
  permission for the capability, or is elevated (guild owner, administrator,
  configured allowed role, or globally trusted). The agent never acts beyond
  the message author's scope, and the LLM is never the sole authority here.
- **Safety policy** — cross-guild operations are blocked; moderation requires
  the feature to be enabled; blocked channels/roles deny.

## Guild isolation

Isolation is structural, not advisory:

- `ExecutionContext` carries the immutable guild id; tools resolve targets from
  `ctx.guild`, never from LLM-supplied guild ids.
- The executor calls `assertSameGuild(requested, ctx.guildId)` on every call and
  **blocks** any mismatch before running.
- Every database table that holds guild state includes `guild_id`, and every
  repository query filters on it. Memory, config, runs, automations, and audit
  records are all guild-scoped.

## Confirmation model

Tools declare a risk level (`READ`, `LOW`, `MEDIUM`, `HIGH`, `DESTRUCTIVE`).
The guild's `confirmation_level` is a threshold: any tool at or above the
threshold requires confirmation. When confirmation is needed, the runtime stops
executing, describes the pending actions, and waits for a `yes` / Confirm button
or `no` / Cancel. The pending tool calls are resumed with confirmation bypassed
only after explicit approval.

Planning mode (`plan` / `preview` / `dry-run`) runs the same loop but turns
mutating tools into recorded no-ops, producing a plan without side effects.

## Memory

`guild_memory` is keyed by `guild_id` plus an optional `scope`
(`GUILD` | `CHANNEL` | `USER`). Memory is loaded into the prompt as
authoritative server preferences and is isolated per guild.

## Directory map

```
src/
├── agent/          runtime, planner, executor, context, memory, policies
├── discord/        client, gateway events, permissions, shared types
├── mcp/            tool registry, executor, validation, tools/*
├── automation/     event-driven automation engine
├── scheduler/      cron-backed scheduler
├── database/       schema, migrations, repositories
├── llm/            provider abstraction + factory
├── security/       boundaries, guild isolation, injection defenses
├── config/         env loading + validation
├── cli/            diagnostics commands
├── app.ts          wiring + Discord handlers
└── index.ts        entrypoint
```
