import { describe, it, expect } from 'vitest';
import { validatePlan, renderPlanForConfirmation } from '../../src/agent/planner/planner.js';

describe('plan validation', () => {
  it('accepts a valid plan', () => {
    const plan = {
      goal: 'Create dev structure',
      steps: [{ action: 'create_category', name: 'Development' }],
    };
    expect(validatePlan(plan).valid).toBe(true);
  });

  it('rejects a plan without a goal', () => {
    const plan = { steps: [{ action: 'create_channel', name: 'x' }] };
    expect(validatePlan(plan).valid).toBe(false);
  });

  it('rejects a plan with an unknown action', () => {
    const plan = { goal: 'g', steps: [{ action: 'delete_server', name: 'x' }] };
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('unknown');
  });

  it('rejects steps missing required name', () => {
    const plan = { goal: 'g', steps: [{ action: 'create_channel' }] };
    expect(validatePlan(plan).valid).toBe(false);
  });

  it('rejects empty steps', () => {
    const plan = { goal: 'g', steps: [] };
    expect(validatePlan(plan).valid).toBe(false);
  });

  it('renders a readable confirmation', () => {
    const text = renderPlanForConfirmation({
      goal: 'g',
      steps: [{ action: 'create_category', name: 'Dev' }],
    });
    expect(text).toContain('1. create_category');
  });
});
