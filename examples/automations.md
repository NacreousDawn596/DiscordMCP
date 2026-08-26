# Automations & scheduled tasks

Automations are guild-scoped event rules. The agent only invokes the LLM when a
configured automation's trigger **and** conditions match — never on every event.

## Event triggers

| Trigger | Fires when |
| --- | --- |
| `message_create` | A message is sent. |
| `message_update` | A message is edited. |
| `message_delete` | A message is deleted. |
| `member_join` | A member joins. |
| `member_leave` | A member leaves. |
| `member_update` | A member changes (nickname, roles…). |
| `channel_create` / `channel_update` / `channel_delete` | A channel changes. |
| `role_create` / `role_update` / `role_delete` | A role changes. |
| `thread_create` / `thread_update` | A thread changes. |
| `reaction_add` | A reaction is added. |
| `voice_state_update` | Someone joins/leaves a voice channel. |

## Conditions

Natural-language conditions. Recognized patterns:

- `"not a bot"` / `"non-bot"` / `"human"` — skip bot members.
- `"only bots"` — only bot members.

## Examples (natural language → stored JSON)

### Welcome on join

```text
@Agent whenever someone joins, welcome them in #general
```

```json
{
  "trigger": "member_join",
  "conditions": [{ "description": "" }],
  "action": { "description": "welcome them in #general" },
  "guild_id": "<current guild>"
}
```

### React to bug reports

```text
@Agent when someone posts a bug report, add the 🐛 reaction
```

```json
{
  "trigger": "message_create",
  "conditions": [{ "description": "" }],
  "action": { "description": "add the 🐛 reaction" },
  "guild_id": "<current guild>"
}
```

### Weekly summary (scheduled)

```text
@Agent every Sunday summarize the week's activity in #staff
```

```json
{
  "cron": "0 0 9 * * 0",
  "action": { "description": "summarize the week's activity in #staff" },
  "channel_id": null,
  "guild_id": "<current guild>"
}
```

### Reminder (scheduled)

```text
@Agent every Monday at 9am post a reminder in #general
```

```json
{
  "cron": "0 9 * * 1",
  "action": { "description": "post a reminder in #general" },
  "channel_id": null,
  "guild_id": "<current guild>"
}
```

## Cron format

Standard 5-field cron: `minute hour day-of-month month day-of-week`.

| Expression | Meaning |
| --- | --- |
| `0 9 * * 1` | Every Monday at 09:00. |
| `0 9 * * *` | Every day at 09:00. |
| `0 0 9 * * 0` | Every Sunday at 09:00. |
| `*/15 * * * *` | Every 15 minutes. |

## Managing automations

```text
@Agent list my automations
@Agent enable automation #1
@Agent delete automation #2
@Agent list my scheduled tasks
@Agent delete schedule #1
```

Tools: `discord.automation.{create,list,delete,enable}` and
`discord.schedule.{create,list,update,delete}`.
