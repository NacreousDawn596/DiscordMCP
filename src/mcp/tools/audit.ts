import { ChannelType } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok } from './helpers.js';

interface Finding {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
}

export function registerAuditTools(): void {
  registerTool({
    name: 'discord.audit.server',
    description: 'Audit the server for permission problems and structural issues. Returns prioritized findings.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const findings = runAudit(ctx);
      return ok(formatFindings(findings), { findings });
    },
  });

  registerTool({
    name: 'discord.audit.permissions',
    description: 'Audit permission configuration across roles and channels.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const findings = runAudit(ctx).filter((f) => f.title.toLowerCase().includes('permission') || f.title.toLowerCase().includes('role'));
      return ok(formatFindings(findings), { findings });
    },
  });

  registerTool({
    name: 'discord.audit.channels',
    description: 'Audit channel structure (orphaned channels, inconsistent overwrites).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const findings = runAudit(ctx).filter((f) => f.title.toLowerCase().includes('channel'));
      return ok(formatFindings(findings), { findings });
    },
  });

  registerTool({
    name: 'discord.audit.roles',
    description: 'Audit roles for unused or over-privileged roles.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const findings = runAudit(ctx).filter((f) => f.title.toLowerCase().includes('role'));
      return ok(formatFindings(findings), { findings });
    },
  });

  registerTool({
    name: 'discord.audit.moderation',
    description: 'Audit moderation setup (roles with moderation powers, moderation channels).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const findings = runAudit(ctx).filter(
        (f) => f.title.toLowerCase().includes('moderat') || f.title.toLowerCase().includes('admin'),
      );
      return ok(formatFindings(findings), { findings });
    },
  });

  registerTool({
    name: 'discord.audit.security',
    description: 'Audit security-sensitive configuration.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const findings = runAudit(ctx).filter((f) => f.severity !== 'LOW');
      return ok(formatFindings(findings), { findings });
    },
  });
}

function runAudit(ctx: Parameters<ToolDescriptor['execute']>[0]): Finding[] {
  const findings: Finding[] = [];
  const guild = ctx.guild;
  const everyone = guild.roles.everyone;

  if (everyone.permissions.has('Administrator')) {
    findings.push({
      severity: 'HIGH',
      title: '@everyone has Administrator',
      detail: 'Every member has full administrative control. This is extremely risky.',
    });
  } else {
    const excessive = ['ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'MentionEveryone']
      .filter((p) => everyone.permissions.has(p as never));
    if (excessive.length > 0) {
      findings.push({
        severity: 'HIGH',
        title: '@everyone has excessive permissions',
        detail: `@everyone holds: ${excessive.join(', ')}.`,
      });
    }
  }

  const memberRoleCounts = new Map<string, number>();
  for (const member of guild.members.cache.values()) {
    for (const role of member.roles.cache.values()) {
      memberRoleCounts.set(role.id, (memberRoleCounts.get(role.id) ?? 0) + 1);
    }
  }

  for (const role of guild.roles.cache.values()) {
    if (role.id === everyone.id || role.managed) continue;
    const assigned = memberRoleCounts.get(role.id) ?? 0;
    if (role.permissions.has('Administrator') && assigned === 0) {
      findings.push({
        severity: 'MEDIUM',
        title: `Unused admin role: ${role.name}`,
        detail: `Role "${role.name}" has Administrator but is assigned to no members.`,
      });
    }
    if (role.permissions.has('Administrator') && assigned > 0) {
      findings.push({
        severity: 'MEDIUM',
        title: `Admin role in use: ${role.name}`,
        detail: `Role "${role.name}" grants Administrator to ${assigned} member(s).`,
      });
    }
  }

  for (const channel of guild.channels.cache.values()) {
    if (channel.isThread()) continue;
    const ch = channel as import('discord.js').GuildChannel;
    if (ch.type === ChannelType.GuildCategory || ch.type === ChannelType.GuildVoice) continue;
    if (!ch.parentId) {
      findings.push({
        severity: 'LOW',
        title: `Orphaned channel #${ch.name}`,
        detail: 'Channel is not inside any category.',
      });
    }
    const everyoneOverwrite = ch.permissionOverwrites.cache.get(everyone.id);
    if (everyoneOverwrite && everyoneOverwrite.deny.has('ViewChannel')) {
      findings.push({
        severity: 'LOW',
        title: `Private channel #${ch.name}`,
        detail: '@everyone is denied ViewChannel (private channel).',
      });
    }
  }

  if (findings.length === 0) {
    findings.push({ severity: 'LOW', title: 'No issues found', detail: 'The server looks clean.' });
  }

  const order: Record<Finding['severity'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}

function formatFindings(findings: Finding[]): string {
  return findings.map((f) => `${f.severity}\n${f.title}\n${f.detail}`).join('\n\n');
}
