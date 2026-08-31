import { describe, it, expect } from 'vitest';
import {
  REACTIONS,
  NEKOS_BEST_GIF_CATEGORIES,
  NEKOS_BEST_IMAGE_CATEGORIES,
  resolveReaction,
  buildCaption,
  fetchImage,
} from '../../src/discord/gifs.js';
import { resolveTargetName } from '../../src/mcp/tools/gif.js';
import type { ExecutionContext } from '../../src/discord/types.js';

function fakeCtx(members: Record<string, string>): ExecutionContext {
  const cache = {
    get: (id: string) => {
      const name = members[id];
      return name ? { displayName: name, user: { username: name } } : undefined;
    },
  };
  return {
    guild: { members: { cache } },
  } as unknown as ExecutionContext;
}

describe('gif reactions', () => {
  it('has all 70 reactions', () => {
    expect(REACTIONS).toHaveLength(70);
    expect(REACTIONS).toContain('kiss');
    expect(REACTIONS).toContain('punch');
    expect(REACTIONS).toContain('yes');
  });

  it('resolves exact reaction names', () => {
    expect(resolveReaction('kiss')).toBe('kiss');
    expect(resolveReaction('hug')).toBe('hug');
  });

  it('maps intents to valid reactions', () => {
    expect(REACTIONS).toContain(resolveReaction('hit them'));
    expect(REACTIONS).toContain(resolveReaction('give a kiss'));
    expect(REACTIONS).toContain(resolveReaction('cry'));
  });

  it('falls back to smile for unknown input', () => {
    expect(resolveReaction('asdfghjkl')).toBe('smile');
    expect(resolveReaction('')).toBe('smile');
  });
});

describe('gif captions', () => {
  it('directs captions at a target when given', () => {
    const cap = buildCaption('punch', 'Alice', '@Bob');
    expect(cap).toContain('Alice');
    expect(cap).toContain('Bob');
  });

  it('strips mentions from names', () => {
    const cap = buildCaption('kiss', '<@123>', '<@456>');
    expect(cap).not.toContain('<@');
  });

  it('produces a caption without a target', () => {
    const cap = buildCaption('wave', 'Alice');
    expect(cap.toLowerCase()).toContain('wave');
  });

  it('has a generic fallback for unmapped reactions', () => {
    const cap = buildCaption('confused', 'Alice');
    expect(cap).toContain('Alice');
  });
});

describe('nekos.best', () => {
  it('lists the 4 image categories', () => {
    expect(NEKOS_BEST_IMAGE_CATEGORIES).toEqual(['neko', 'kitsune', 'husband', 'waifu']);
  });

  it('has 59 gif categories', () => {
    expect(NEKOS_BEST_GIF_CATEGORIES).toHaveLength(59);
    expect(NEKOS_BEST_GIF_CATEGORIES).toContain('kiss');
    expect(NEKOS_BEST_GIF_CATEGORIES).toContain('hug');
  });

  it('rejects unknown image categories before any network call', async () => {
    await expect(fetchImage('dragon')).rejects.toThrow('Unknown image category');
  });
});

describe('resolveTargetName', () => {
  const ctx = fakeCtx({ '750613494172483626': 'Cindy' });

  it('resolves a raw user id to a display name', () => {
    expect(resolveTargetName(ctx, '750613494172483626')).toBe('Cindy');
  });

  it('resolves a mention to a display name', () => {
    expect(resolveTargetName(ctx, '<@750613494172483626>')).toBe('Cindy');
    expect(resolveTargetName(ctx, '<@!750613494172483626>')).toBe('Cindy');
  });

  it('leaves plain names untouched', () => {
    expect(resolveTargetName(ctx, 'Bob')).toBe('Bob');
  });

  it('falls back to the id when the member is unknown', () => {
    expect(resolveTargetName(ctx, '111111111111111111')).toBe('111111111111111111');
  });
});
