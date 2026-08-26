import { ChannelType } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel } from './helpers.js';

export function registerForumTools(): void {
  registerTool({
    name: 'discord.forum.list',
    description: 'List forum channels and their posts in the server.',
    inputSchema: {
      type: 'object',
      properties: { forum: { type: 'string', description: 'Optional forum channel name/id.' } },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const forums = ctx.guild.channels.cache.filter((c) => c.type === ChannelType.GuildForum);
      const lines: string[] = [];
      for (const forum of forums.values()) {
        lines.push(`#${forum.name}`);
        const active = await (forum as unknown as { threads: { fetchActive: () => Promise<{ threads: { values: () => Iterable<{ name: string; id: string }> } }> } }).threads.fetchActive();
        for (const post of active.threads.values()) {
          lines.push(`  - ${post.name} (${post.id})`);
        }
      }
      return ok(lines.length ? lines.join('\n') : 'No forums.');
    },
  });

  registerTool({
    name: 'discord.forum.create_post',
    description: 'Create a post in a forum channel.',
    inputSchema: {
      type: 'object',
      properties: {
        forum: { type: 'string', description: 'Forum channel name/id.' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['forum', 'title', 'content'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const forum = findChannel(ctx.guild, args.forum as string);
      if (!forum || !('threads' in forum)) return fail('Forum channel not found.');
      const post = await (forum as unknown as {
        threads: {
          create: (opts: { name: string; message: { content: string } }) => Promise<{ id: string; name: string }>;
        };
      }).threads.create({
        name: String(args.title).slice(0, 100),
        message: { content: String(args.content).slice(0, 2000) },
      });
      return ok(`Created forum post "${post.name}" (${post.id}).`, { id: post.id });
    },
  });

  registerTool({
    name: 'discord.forum.get_post',
    description: 'Get a forum post by id and read its first message.',
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' } },
      required: ['post_id'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const post = await ctx.guild.channels.fetch(String(args.post_id)).catch(() => null);
      if (!post || !('messages' in post)) return fail(`Post not found: ${args.post_id}`);
      const messages = await (post as unknown as {
        messages: { fetch: (opts: { limit: number }) => Promise<Map<string, { content: string; author: { tag: string } }>> };
      }).messages.fetch({ limit: 1 });
      const first = [...messages.values()][0];
      return ok(first ? `${first.author.tag}: ${first.content}` : 'Empty post.');
    },
  });

  registerTool({
    name: 'discord.forum.edit_post',
    description: 'Edit the title of a forum post.',
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' }, title: { type: 'string' } },
      required: ['post_id', 'title'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const post = await ctx.guild.channels.fetch(String(args.post_id)).catch(() => null);
      if (!post || !('setName' in post)) return fail(`Post not found: ${args.post_id}`);
      await (post as unknown as { setName(n: string): Promise<unknown> }).setName(String(args.title).slice(0, 100));
      return ok('Forum post updated.');
    },
  });

  registerTool({
    name: 'discord.forum.delete_post',
    description: 'Delete a forum post.',
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' } },
      required: ['post_id'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const post = await ctx.guild.channels.fetch(String(args.post_id)).catch(() => null);
      if (!post || !('delete' in post)) return fail(`Post not found: ${args.post_id}`);
      await (post as unknown as { delete(): Promise<unknown> }).delete();
      return ok('Forum post deleted.');
    },
  });

  registerTool({
    name: 'discord.forum.add_tag',
    description: 'Apply an available tag to a forum post.',
    inputSchema: {
      type: 'object',
      properties: {
        forum: { type: 'string' },
        post_id: { type: 'string' },
        tag: { type: 'string', description: 'Tag name.' },
      },
      required: ['forum', 'post_id', 'tag'],
    },
    risk: 'LOW',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const forum = findChannel(ctx.guild, args.forum as string);
      if (!forum || !('availableTags' in forum)) return fail('Forum not found.');
      const tags = (forum as unknown as { availableTags: Array<{ id: string; name: string }> }).availableTags;
      const tag = tags.find((t) => t.name.toLowerCase() === String(args.tag).toLowerCase());
      if (!tag) return fail(`Tag not found: ${args.tag}`);
      const post = await ctx.guild.channels.fetch(String(args.post_id)).catch(() => null);
      if (!post || !('setAppliedTags' in post)) return fail(`Post not found: ${args.post_id}`);
      await (post as unknown as { setAppliedTags(ids: string[]): Promise<unknown> }).setAppliedTags([tag.id]);
      return ok(`Applied tag "${tag.name}" to post.`);
    },
  });

  registerTool({
    name: 'discord.forum.remove_tag',
    description: 'Remove all tags from a forum post.',
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' } },
      required: ['post_id'],
    },
    risk: 'LOW',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const post = await ctx.guild.channels.fetch(String(args.post_id)).catch(() => null);
      if (!post || !('setAppliedTags' in post)) return fail(`Post not found: ${args.post_id}`);
      await (post as unknown as { setAppliedTags(ids: string[]): Promise<unknown> }).setAppliedTags([]);
      return ok('Removed tags from post.');
    },
  });
}
