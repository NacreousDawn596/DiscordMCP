import type { JsonSchema } from '../llm/types.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Minimal JSON Schema validator sufficient for the tool input schemas in this
 * project. Supports: object, string, number, integer, boolean, array, enum,
 * required, and additionalProperties=false. It intentionally does not support
 * the full JSON Schema draft — only what the Discord tools declare.
 */
export function validateAgainstSchema(schema: JsonSchema, value: unknown): ValidationResult {
  const errors: string[] = [];
  validate(value, schema, '$', errors);
  return { ok: errors.length === 0, errors };
}

function validate(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  const type = schema.type as string | undefined;

  if (schema.enum !== undefined) {
    const enums = schema.enum as unknown[];
    if (!enums.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
      errors.push(`${path}: must be one of ${JSON.stringify(enums)}`);
    }
    return;
  }

  switch (type) {
    case 'object': {
      if (typeOf(value) !== 'object') {
        errors.push(`${path}: expected object`);
        return;
      }
      const obj = value as Record<string, unknown>;
      const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
      for (const [key, sub] of Object.entries(props)) {
        if (obj[key] !== undefined) {
          validate(obj[key], sub, `${path}.${key}`, errors);
        }
      }
      if (schema.required !== undefined) {
        for (const key of schema.required as string[]) {
          if (obj[key] === undefined) {
            errors.push(`${path}.${key}: is required`);
          }
        }
      }
      return;
    }
    case 'array': {
      if (typeOf(value) !== 'array') {
        errors.push(`${path}: expected array`);
        return;
      }
      const items = schema.items as JsonSchema | undefined;
      if (items) {
        (value as unknown[]).forEach((item, i) => validate(item, items, `${path}[${i}]`, errors));
      }
      return;
    }
    case 'string': {
      if (typeOf(value) !== 'string') {
        errors.push(`${path}: expected string`);
        return;
      }
      if (schema.minLength !== undefined && (value as string).length < (schema.minLength as number)) {
        errors.push(`${path}: must be at least ${schema.minLength} characters`);
      }
      if (schema.maxLength !== undefined && (value as string).length > (schema.maxLength as number)) {
        errors.push(`${path}: must be at most ${schema.maxLength} characters`);
      }
      return;
    }
    case 'number': {
      if (typeOf(value) !== 'number') {
        errors.push(`${path}: expected number`);
      }
      return;
    }
    case 'integer': {
      if (typeOf(value) !== 'number' || !Number.isInteger(value)) {
        errors.push(`${path}: expected integer`);
      }
      return;
    }
    case 'boolean': {
      if (typeOf(value) !== 'boolean') {
        errors.push(`${path}: expected boolean`);
      }
      return;
    }
    default:
      return;
  }
}
