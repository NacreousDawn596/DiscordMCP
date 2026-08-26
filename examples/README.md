# Examples

Ready-to-use examples for every way you can talk to the agent.

| File | What's inside |
| --- | --- |
| [`prompts.md`](./prompts.md) | Every message/reply/tag scenario — chitchat, planning, permissions, memory, moderation, etc. |
| [`automations.md`](./automations.md) | Event-listener automations and scheduled tasks (natural language + JSON). |
| [`configs/`](./configs) | Provider-specific `.env` examples (OpenAI, Anthropic, Gemini, DeepSeek, Ollama, OpenRouter). |

## How the agent is triggered

The agent only acts when addressed. It listens for:

1. **Mention / tag** — `@Agent …`
2. **Reply** — replying to one of the bot's messages
3. **Slash command** — `/agent message: …`
4. **Confirmation** — a `yes` / `no` reply or a `Confirm` / `Cancel` button after it asks

Unaddressed messages in a channel are ignored (unless they answer a pending
confirmation).

## Modes (pick by prefixing your message)

| Prefix | Mode | Behavior |
| --- | --- | --- |
| *(none)* | `normal` | Inspect, plan, execute, verify. |
| `plan …` / `preview …` / `dry-run …` | `planning` | Describes what it *would* do — no changes. |
| `analyze …` / `audit …` | `analysis` | Read-only inspection and reasoning. |

## Quick tour

```text
@Agent hello                                    → chitchat
@Agent what can you do?                         → capability summary
@Agent plan how we should reorganize this server → a plan, no changes
@Agent organize this server                     → executes the plan
@Agent why can't John send messages in #general? → permission explanation
@Agent remember that release channels are read-only
@Agent whenever someone joins, welcome them in #general
@Agent every Monday at 9am post a reminder in #general
```

See [`prompts.md`](./prompts.md) for the full catalog.
