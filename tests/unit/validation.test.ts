import { describe, it, expect } from 'vitest';
import { validateAgainstSchema } from '../../src/mcp/validation.js';

describe('tool argument validation', () => {
  it('accepts valid objects', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    expect(validateAgainstSchema(schema, { name: 'dev' }).ok).toBe(true);
  });

  it('rejects missing required fields', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const r = validateAgainstSchema(schema, {});
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('name');
  });

  it('rejects wrong types', () => {
    const schema = {
      type: 'object',
      properties: { limit: { type: 'integer' } },
      required: [],
    };
    expect(validateAgainstSchema(schema, { limit: 'not-a-number' }).ok).toBe(false);
    expect(validateAgainstSchema(schema, { limit: 5 }).ok).toBe(true);
  });

  it('validates enums', () => {
    const schema = {
      type: 'object',
      properties: { type: { type: 'string', enum: ['text', 'voice'] } },
      required: [],
    };
    expect(validateAgainstSchema(schema, { type: 'text' }).ok).toBe(true);
    expect(validateAgainstSchema(schema, { type: 'forum' }).ok).toBe(false);
  });

  it('rejects non-object arguments for object schemas', () => {
    const schema = { type: 'object', properties: {}, required: [] };
    expect(validateAgainstSchema(schema, null).ok).toBe(false);
  });
});
