import { describe, it, expect } from 'vitest';
import { requiresConfirmation, riskRankOf } from '../../src/agent/policies/risk.js';

describe('risk classification', () => {
  it('orders risk levels correctly', () => {
    expect(riskRankOf('READ')).toBeLessThan(riskRankOf('LOW'));
    expect(riskRankOf('LOW')).toBeLessThan(riskRankOf('MEDIUM'));
    expect(riskRankOf('MEDIUM')).toBeLessThan(riskRankOf('HIGH'));
    expect(riskRankOf('HIGH')).toBeLessThan(riskRankOf('DESTRUCTIVE'));
  });

  it('requires confirmation at or above the configured level', () => {
    expect(requiresConfirmation('LOW', 'HIGH')).toBe(false);
    expect(requiresConfirmation('MEDIUM', 'HIGH')).toBe(false);
    expect(requiresConfirmation('HIGH', 'HIGH')).toBe(true);
    expect(requiresConfirmation('DESTRUCTIVE', 'HIGH')).toBe(true);
  });

  it('DESTRUCTIVE level only confirms destructive actions', () => {
    expect(requiresConfirmation('HIGH', 'DESTRUCTIVE')).toBe(false);
    expect(requiresConfirmation('DESTRUCTIVE', 'DESTRUCTIVE')).toBe(true);
  });

  it('NEVER never requires confirmation and ALWAYS always does', () => {
    expect(requiresConfirmation('DESTRUCTIVE', 'NEVER')).toBe(false);
    expect(requiresConfirmation('READ', 'ALWAYS')).toBe(true);
  });
});
