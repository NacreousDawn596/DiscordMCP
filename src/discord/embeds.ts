import { EmbedBuilder } from 'discord.js';

export interface EmbedFieldInput {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedFooterInput {
  text: string;
  icon_url?: string;
}

export interface EmbedAuthorInput {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface EmbedImageInput {
  url: string;
}

export interface EmbedInput {
  title?: string;
  description?: string;
  url?: string;
  color?: string | number;
  timestamp?: string | boolean | number | Date;
  footer?: EmbedFooterInput | string;
  image?: EmbedImageInput | string;
  thumbnail?: EmbedImageInput | string;
  author?: EmbedAuthorInput | string;
  fields?: EmbedFieldInput[];
}

const COLOR_NAMES: Record<string, number> = {
  DEFAULT: 0x000000,
  WHITE: 0xffffff,
  AQUA: 0x1abc9c,
  GREEN: 0x57f287,
  BLUE: 0x3498db,
  YELLOW: 0xf1c40f,
  PURPLE: 0x9b59b6,
  LUMINOUS_VIVID_PINK: 0xe91e63,
  FUCHSIA: 0xeb459e,
  GOLD: 0xf1c40f,
  ORANGE: 0xe67e22,
  RED: 0xed4245,
  GREY: 0x95a5a6,
  NAVY: 0x34495e,
  DARK_AQUA: 0x11806a,
  DARK_GREEN: 0x1f8b4c,
  DARK_BLUE: 0x206694,
  DARK_PURPLE: 0x71368a,
  DARK_VIVID_PINK: 0xad1457,
  DARK_GOLD: 0xc27c0e,
  DARK_ORANGE: 0xa84300,
  DARK_RED: 0x992d22,
  DARK_GREY: 0x979c9f,
  DARKER_GREY: 0x7f8c8d,
  LIGHT_GREY: 0xbcc0c0,
  DARK_NAVY: 0x2c3e50,
  BLURPLE: 0x5865f2,
  GREYPLE: 0x99aab5,
  DARK_BUT_NOT_BLACK: 0x2b2d31,
  NOT_QUITE_BLACK: 0x23272a,
  CYAN: 0x00ffff,
  MAGENTA: 0xff00ff,
};

export function parseColor(color: string | number): number | undefined {
  if (typeof color === 'number') {
    return isNaN(color) ? undefined : color;
  }

  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (!trimmed) return undefined;

    const upper = trimmed.toUpperCase();
    if (COLOR_NAMES[upper] !== undefined) {
      return COLOR_NAMES[upper];
    }

    if (trimmed.startsWith('#')) {
      const hex = parseInt(trimmed.slice(1), 16);
      return isNaN(hex) ? undefined : hex;
    }

    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      const hex = parseInt(trimmed.slice(2), 16);
      return isNaN(hex) ? undefined : hex;
    }

    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
      const hex = parseInt(trimmed, 16);
      return isNaN(hex) ? undefined : hex;
    }

    const num = parseInt(trimmed, 10);
    return isNaN(num) ? undefined : num;
  }

  return undefined;
}

export function buildEmbed(data: EmbedInput): EmbedBuilder {
  const embed = new EmbedBuilder();

  if (data.title) embed.setTitle(String(data.title));
  if (data.description) embed.setDescription(String(data.description));
  if (data.url) embed.setURL(String(data.url));

  if (data.color !== undefined && data.color !== null) {
    const parsed = parseColor(data.color);
    if (parsed !== undefined) {
      embed.setColor(parsed);
    }
  }

  if (data.timestamp) {
    if (data.timestamp === true) {
      embed.setTimestamp();
    } else if (typeof data.timestamp === 'string' || typeof data.timestamp === 'number') {
      const d = new Date(data.timestamp);
      if (!isNaN(d.getTime())) embed.setTimestamp(d);
    } else if (data.timestamp instanceof Date) {
      if (!isNaN(data.timestamp.getTime())) embed.setTimestamp(data.timestamp);
    }
  }

  if (data.footer) {
    if (typeof data.footer === 'string') {
      embed.setFooter({ text: data.footer });
    } else if (data.footer.text) {
      embed.setFooter({
        text: String(data.footer.text),
        iconURL: data.footer.icon_url ? String(data.footer.icon_url) : undefined,
      });
    }
  }

  if (data.image) {
    const url = typeof data.image === 'string' ? data.image : data.image.url;
    if (url) embed.setImage(String(url));
  }

  if (data.thumbnail) {
    const url = typeof data.thumbnail === 'string' ? data.thumbnail : data.thumbnail.url;
    if (url) embed.setThumbnail(String(url));
  }

  if (data.author) {
    if (typeof data.author === 'string') {
      embed.setAuthor({ name: data.author });
    } else if (data.author.name) {
      embed.setAuthor({
        name: String(data.author.name),
        url: data.author.url ? String(data.author.url) : undefined,
        iconURL: data.author.icon_url ? String(data.author.icon_url) : undefined,
      });
    }
  }

  if (Array.isArray(data.fields)) {
    for (const field of data.fields) {
      if (field && field.name && field.value) {
        embed.addFields({
          name: String(field.name),
          value: String(field.value),
          inline: Boolean(field.inline),
        });
      }
    }
  }

  return embed;
}
