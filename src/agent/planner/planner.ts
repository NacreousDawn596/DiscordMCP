export interface PlanStep {
  action: string;
  [key: string]: unknown;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
}

const KNOWN_ACTIONS = new Set([
  'create_category',
  'create_channel',
  'create_role',
  'edit_role',
  'delete_channel',
  'delete_role',
  'set_permissions',
  'assign_role',
  'remove_role',
  'set_topic',
  'set_slowmode',
  'archive_thread',
]);

/**
 * Validates a plan before execution. The execution engine must reject a plan
 * that does not pass this validator, rather than blindly executing steps.
 */
export function validatePlan(plan: unknown): PlanValidationResult {
  const errors: string[] = [];

  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['plan must be an object'] };
  }

  const p = plan as Partial<Plan>;

  if (typeof p.goal !== 'string' || p.goal.trim().length === 0) {
    errors.push('plan.goal must be a non-empty string');
  }

  if (!Array.isArray(p.steps) || p.steps.length === 0) {
    errors.push('plan.steps must be a non-empty array');
  } else {
    p.steps.forEach((step, i) => {
      if (!step || typeof step !== 'object') {
        errors.push(`steps[${i}] must be an object`);
        return;
      }
      if (typeof step.action !== 'string' || !KNOWN_ACTIONS.has(step.action)) {
        errors.push(`steps[${i}].action is unknown: ${String(step.action)}`);
      }
      if (['create_channel', 'create_category', 'create_role'].includes(step.action)) {
        if (typeof step.name !== 'string' || step.name.trim().length === 0) {
          errors.push(`steps[${i}].name is required for ${step.action}`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function renderPlanForConfirmation(plan: Plan): string {
  const lines = plan.steps.map((s, i) => {
    const detail = Object.entries(s)
      .filter(([k]) => k !== 'action')
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    return `  ${i + 1}. ${s.action}${detail ? ` ${detail}` : ''}`;
  });
  return `Goal: ${plan.goal}\n${lines.join('\n')}`;
}
