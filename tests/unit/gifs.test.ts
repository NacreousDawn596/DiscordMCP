import { describe, it, expect } from 'vitest';
import { REACTIONS, resolveReaction, buildCaption } from '../../src/discord/gifs.js';

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
