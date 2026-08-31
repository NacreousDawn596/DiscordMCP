# Prompt catalog — all interaction scenarios

Every example below is a literal message you can send in Discord. The agent is
invoked by mention (`@Agent …`) or by replying to the bot; the `@Agent` prefix is
shown for clarity but a reply to the bot works the same way.

> Permission note: the agent never acts beyond **your** Discord permissions. If
> you can't do something yourself, the agent will refuse to do it for you.

---

## 1. Casual chitchat & simple messages

| You say | What happens |
| --- | --- |
| `@Agent hello` | Greets you back (no tools used). |
| `@Agent hi, how are you?` | Small talk. |
| `@Agent who are you?` | Explains what it is and what it can do. |
| `@Agent what can you do?` | Summarizes its capabilities. |
| `@Agent thanks!` | Polite acknowledgment. |
| `@Agent good bot` | Appreciative response. |

These are pure conversation — no Discord API calls are made.

## 2. Mentions, replies & tags

| Scenario | Example |
| --- | --- |
| Direct mention | `@Agent list the roles` |
| Mention mid-sentence | `can you @Agent clean up #dev?` |
| Reply to the bot | (reply to its last message) `now also make a #staff channel` |
| Confirmation — accept | `yes` / `confirm` / `proceed` / `go ahead` |
| Confirmation — decline | `no` / `cancel` / `stop` |
| Confirmation — button | Click `Confirm` or `Cancel` under the prompt |
| Slash command | `/agent message: organize this server` |

Confirmation appears only when an action is at or above the configured risk
threshold (e.g. deleting a channel, banning a member).

## 3. Planning, preview & dry-run

| You say | Result |
| --- | --- |
| `@Agent plan how we should reorganize this server` | A step-by-step plan, nothing executed. |
| `@Agent preview a support system` | Shows the intended structure, no changes. |
| `@Agent dry-run cleaning up unused channels` | Lists what would be deleted. |

## 4. Analysis & auditing

| You say | Result |
| --- | --- |
| `@Agent analyze this server` | Read-only summary and suggestions. |
| `@Agent audit the server permissions` | Findings ranked HIGH/MEDIUM/LOW. |
| `@Agent audit the roles` | Unused / over-privileged roles. |
| `@Agent how would you improve this server?` | Recommendations without changes. |

## 5. Server inspection

| You say |
| --- |
| `@Agent what does this server look like?` |
| `@Agent list the categories` |
| `@Agent list the channels` |
| `@Agent list the roles` |
| `@Agent show me the members` |
| `@Agent what are the server settings?` |

## 6. Channel management

| You say | Behavior |
| --- | --- |
| `@Agent create a Development category` | Creates the category. |
| `@Agent create a Development category with #frontend, #backend, and #devops` | Creates all four. |
| `@Agent make a private staff section` | Category + channels + permission overwrites. |
| `@Agent put all dev channels under Development` | Moves channels. |
| `@Agent rename #general to #lobby` | Renames. |
| `@Agent set the topic of #rules to "Read before posting"` | Sets topic. |
| `@Agent set slowmode on #chat to 10 seconds` | Sets slowmode. |
| `@Agent mark #memes as NSFW` | Toggles NSFW. |
| `@Agent delete #old-dev` | **Confirmation required** (DESTRUCTIVE). |
| `@Agent clone #announcements into #news` | Clones channel. |

## 7. Role management

| You say |
| --- |
| `@Agent create a Developer role with a blue color` |
| `@Agent give @John the Developer role` |
| `@Agent remove the Developer role from @John` |
| `@Agent rename the Member role to Community` |
| `@Agent which is higher, Moderator or Developer?` |

## 8. Permission intelligence

| You say | Behavior |
| --- | --- |
| `@Agent why can't John send messages in #general?` | Walks roles → permissions → overwrites → answer. |
| `@Agent everyone should be able to see #announcements but not talk` | Configures read-only. |
| `@Agent make moderators able to manage messages but not roles` | Configures the role. |
| `@Agent show me everything the moderators can access` | Enumerates. |
| `@Agent give verified members access to the community section` | Configures access. |

## 9. Message capabilities

| You say |
| --- |
| `@Agent send "Deploy is live" to #announcements` |
| `@Agent pin that message` |
| `@Agent react 🐛 to my last message` |
| `@Agent find what people said about the database outage yesterday` |
| `@Agent show the last 20 messages in #general` |

## 10. Threads & forums

| You say |
| --- |
| `@Agent create a thread in #general called "Release notes"` |
| `@Agent archive the "Q1 planning" thread` |
| `@Agent create a bug-report forum` |
| `@Agent post a bug report in #bugs titled "Login is broken"` |

## 11. Members

| You say | Behavior |
| --- | --- |
| `@Agent who is @John?` | Profile + roles. |
| `@Agent set @John's nickname to "Johnny"` | Sets nickname. |
| `@Agent timeout @John for 10 minutes` | Times out. |
| `@Agent kick @John` | **Confirmation required** (DESTRUCTIVE). |
| `@Agent ban @spammer` | **Confirmation required** (DESTRUCTIVE). |

## 12. Moderation (requires `ENABLE_MODERATION=true`)

| You say |
| --- |
| `@Agent warn @John for spamming` |
| `@Agent purge the last 20 messages in #general` |
| `@Agent ban this spam account` |

## 13. Memory

| You say | Behavior |
| --- | --- |
| `@Agent remember that release channels should always be read-only` | Stores guild memory. |
| `@Agent remember that all dev channels go under Development` | Stores a convention. |
| `@Agent what do you remember about this server?` | Lists memory. |
| `@Agent forget that release channels are read-only` | Deletes the entry. |

Memory is scoped to the guild — it never leaks to other servers.

## 14. Server transformation

| You say |
| --- |
| `@Agent turn this into a professional software-development server` |
| `@Agent organize this server` |
| `@Agent make this server suitable for a university programming club` |
| `@Agent clean up unused channels` |
| `@Agent find duplicate roles` |
| `@Agent make this server look organized` |

The agent inspects first, proposes a plan, and (for larger changes) asks before
executing.

## 15. Idempotent / bulk operations

| You say | Behavior |
| --- | --- |
| `@Agent create #backend` (already exists) | Reports "already exists" — no `#backend-2`. |
| `@Agent create 5 channels for the team` | Bulk create with per-item results. |
| `@Agent assign the Member role to everyone who just joined` | Bulk assign. |

## 16. Analytics

| You say |
| --- |
| `@Agent which channels are most active?` |
| `@Agent which channels have been inactive for 30 days?` |
| `@Agent what topics are people discussing?` |
| `@Agent when is the server most active?` |

## 17. Automations (event listeners)

| You say |
| --- |
| `@Agent whenever someone joins, welcome them in #general` |
| `@Agent when someone posts a bug report, add the 🐛 reaction` |
| `@Agent every Sunday summarize the week's activity in #staff` |

See [`automations.md`](./automations.md) for the full trigger list and the JSON
these turn into.

## 18. Scheduled tasks

| You say |
| --- |
| `@Agent every Monday at 9am post a reminder in #general` |
| `@Agent every Friday summarize unresolved support threads` |
| `@Agent list my scheduled tasks` |
| `@Agent delete schedule #3` |

## 19. Economy, XP & notebook

| You say | What happens |
| --- | --- |
| `@Agent !xp` / `@Agent what is my xp?` | Instant XP read (no LLM call). |
| `@Agent !balance` / `@Agent my coins` | Instant balance read. |
| `@Agent !level` | Instant level read. |
| `@Agent set my coins to 100` | Stores `coins=100` in the notebook. |
| `@Agent add 50 coins to me` | Atomically increments the member's coins. |
| `@Agent push "deployed v2" to my activity log` | Appends to a list entry. |
| `@Agent what's stored under "shop" in this server?` | Reads a guild-scoped entry. |
| `@Agent list all economy entries` | Queries the notebook by category. |

Passive XP is separate: with `XP_PER_MESSAGE > 0` the bot awards XP on every
message (throttled by `XP_COOLDOWN_SECONDS`) — no prompt needed.

## 20. Embeds, buttons & modals

| You say |
| --- |
| `@Agent send an embed with title "Rules" and description "Be nice" in #info` |
| `@Agent send a message with a Confirm and a Cancel button in #general` |
| `@Agent make a button that gives 50 coins when clicked` |
| `@Agent create an application form with fields for name and reason, posted via a button` |
| `@Agent bulk delete the last 20 messages in #spam` |

Buttons and forms are stored in the notebook (`button_actions` / `modal_configs`)
so clicks and submissions can be routed without the LLM re-deciding.

## 21. Reaction roles

| You say |
| --- |
| `@Agent create a reaction role: 🟢 gives the Member role on #roles` |
| `@Agent when someone reacts with 🐛 to a message, add role "Bug Hunter"` |

Reacting adds the role; removing the reaction takes it away. Handled instantly
(no LLM call).

## 22. Reaction GIFs, emojis & stickers

| You say | What happens |
| --- | --- |
| `@Agent kiss @Bob` | Sends a kiss GIF embed + *"You kissed Bob!"* |
| `@Agent hit @Bob` | Sends a punch/slap GIF + a funny caption. |
| `@Agent hug me` | Sends a hug GIF. |
| `@Agent send a wave gif in #general` | Sends a wave GIF to that channel. |
| `@Agent send me a neko image` | Sends a nekos.best neko image. |
| `@Agent show me a waifu` | Sends a waifu image. |
| `@Agent what emojis does this server have?` | Lists custom emojis as `<:name:id>`. |
| `@Agent react with the server's hype emoji` | Resolves an emoji to its tag. |
| `@Agent send the "pog" sticker` | Sends a server sticker. |
| `@Agent what stickers are available?` | Lists server stickers. |

GIFs come from the OtakuGIFs API (no key). Intents like "hit" are auto-mapped to
a concrete reaction ("punch"/"slap").

## 23. Error & edge scenarios

| You say / situation | What happens |
| --- | --- |
| `@Agent delete #general` (as a normal member) | **Denied** — you're not authorized. |
| `@Agent ban @spammer` (moderation disabled) | **Denied** — moderation is off. |
| `@Agent do something in another server` | **Blocked** — cross-guild operations are impossible. |
| Bot lacks `Manage Channels` | It reports the missing permission and doesn't fake success. |
| A step fails mid-plan | It reports `4/5 steps done` with the exact failure reason. |

## 24. Configuration (admins)

| You say |
| --- |
| `@Agent only administrators can ask you to change permissions` |
| `@Agent block #secrets from you` |
| `@Agent allow the Moderator role to command you` |

Per-guild config (confirmation level, allowed/blocked roles and channels,
capabilities) is enforced in code — see
[`docs/CONFIGURATION.md`](../docs/CONFIGURATION.md).
