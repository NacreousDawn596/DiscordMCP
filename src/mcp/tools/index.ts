import { registerGuildTools } from './guild.js';
import { registerChannelTools } from './channel.js';
import { registerRoleTools } from './role.js';
import { registerPermissionTools } from './permission.js';
import { registerMessageTools } from './message.js';
import { registerMemberTools } from './member.js';
import { registerModerationTools } from './moderation.js';
import { registerThreadTools } from './thread.js';
import { registerForumTools } from './forum.js';
import { registerSearchTools } from './search.js';
import { registerAuditTools } from './audit.js';
import { registerAnalyticsTools } from './analytics.js';
import { registerMemoryTools } from './memory.js';
import { registerAutomationTools } from './automation.js';
import { registerScheduleTools } from './schedule.js';
import { registerServerTools } from './server.js';
import { registerNotebookTools } from './notebook.js';

let registered = false;

export function registerAllTools(): void {
  if (registered) return;
  registered = true;

  registerGuildTools();
  registerChannelTools();
  registerRoleTools();
  registerPermissionTools();
  registerMessageTools();
  registerMemberTools();
  registerModerationTools();
  registerThreadTools();
  registerForumTools();
  registerSearchTools();
  registerAuditTools();
  registerAnalyticsTools();
  registerMemoryTools();
  registerAutomationTools();
  registerScheduleTools();
  registerServerTools();
  registerNotebookTools();
}

