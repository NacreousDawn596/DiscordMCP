import type { ConfirmationLevel, RiskLevel } from '../../config/env.js';

const riskRank: Record<RiskLevel, number> = {
  READ: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  DESTRUCTIVE: 4,
};

export function riskRankOf(risk: RiskLevel): number {
  return riskRank[risk];
}

/**
 * A confirmation level is a threshold: any operation whose risk rank is
 * greater than or equal to the configured level requires user confirmation.
 *
 *   NEVER       -> never require confirmation
 *   ALWAYS      -> always require confirmation
 *   DESTRUCTIVE -> only DESTRUCTIVE requires confirmation
 *   HIGH        -> HIGH and DESTRUCTIVE require confirmation
 */
export function requiresConfirmation(
  risk: RiskLevel,
  level: ConfirmationLevel,
): boolean {
  if (level === 'ALWAYS') return true;
  if (level === 'NEVER') return false;

  const levelRank: Record<Exclude<ConfirmationLevel, 'NEVER' | 'ALWAYS'>, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    DESTRUCTIVE: 4,
  };

  return riskRank[risk] >= levelRank[level];
}

export function isDestructive(risk: RiskLevel): boolean {
  return risk === 'DESTRUCTIVE';
}

export function describeRisk(risk: RiskLevel): string {
  return risk;
}
