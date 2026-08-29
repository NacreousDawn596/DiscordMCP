import { describe, expect, it } from 'vitest';
import { buildEmbed, parseColor } from '../../src/discord/embeds.js';

describe('Discord Embed Builder', () => {
  it('parses colors in various formats', () => {
    expect(parseColor('#FF0000')).toBe(0xff0000);
    expect(parseColor('0xFF0000')).toBe(0xff0000);
    expect(parseColor('FF0000')).toBe(0xff0000);
    expect(parseColor('Red')).toBe(0xed4245);
    expect(parseColor('Blue')).toBe(0x3498db);
    expect(parseColor('Gold')).toBe(0xf1c40f);
    expect(parseColor(16711680)).toBe(16711680);
    expect(parseColor('invalid')).toBeUndefined();
  });

  it('builds full EmbedBuilder with all parameters', () => {
    const embed = buildEmbed({
      title: 'Server Announcement',
      description: 'Welcome to the server!',
      url: 'https://discord.com',
      color: '#00FF00',
      timestamp: true,
      footer: { text: 'Footer Text', icon_url: 'https://example.com/icon.png' },
      image: 'https://example.com/image.png',
      thumbnail: 'https://example.com/thumb.png',
      author: { name: 'Admin', url: 'https://example.com', icon_url: 'https://example.com/avatar.png' },
      fields: [
        { name: 'Rule 1', value: 'Be nice', inline: true },
        { name: 'Rule 2', value: 'No spam', inline: false },
      ],
    });

    const json = embed.toJSON();

    expect(json.title).toBe('Server Announcement');
    expect(json.description).toBe('Welcome to the server!');
    expect(json.url).toBe('https://discord.com');
    expect(json.color).toBe(0x00ff00);
    expect(json.timestamp).toBeDefined();
    expect(json.footer).toEqual({ text: 'Footer Text', icon_url: 'https://example.com/icon.png' });
    expect(json.image).toEqual({ url: 'https://example.com/image.png' });
    expect(json.thumbnail).toEqual({ url: 'https://example.com/thumb.png' });
    expect(json.author).toEqual({
      name: 'Admin',
      url: 'https://example.com',
      icon_url: 'https://example.com/avatar.png',
    });
    expect(json.fields).toHaveLength(2);
    expect(json.fields![0]).toEqual({ name: 'Rule 1', value: 'Be nice', inline: true });
    expect(json.fields![1]).toEqual({ name: 'Rule 2', value: 'No spam', inline: false });
  });
});
