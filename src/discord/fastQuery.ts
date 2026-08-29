import { notebookRepository } from '../database/repositories/notebookRepository.js';

/**
 * Fast-path query handler for common user stats (XP, coins, level, warnings)
 * Returns instant markdown response string (<10ms) or null if query requires full AI agent reasoning.
 */
export function tryFastQuery(guildId: string, memberId: string, text: string): string | null {
  const lower = text.trim().toLowerCase();

  // 1. Match XP queries
  if (
    /\b(?:what\s+is\s+my\s+xp|my\s+xp|check\s+xp|show\s+xp|\b!xp\b|\bxp\b)\b/i.test(lower) &&
    !lower.includes('set') &&
    !lower.includes('add') &&
    !lower.includes('give')
  ) {
    const entry = notebookRepository.getEntry({
      guildId,
      key: 'xp',
      memberId,
    });
    const xp = entry ? entry.value : '0';
    return `⭐ You currently have **${xp} XP**.`;
  }

  // 2. Match Coins / Balance queries
  if (
    /\b(?:what\s+is\s+my\s+balance|my\s+balance|my\s+coins|coins|balance|\b!coins\b|\b!balance\b)\b/i.test(
      lower,
    ) &&
    !lower.includes('set') &&
    !lower.includes('add') &&
    !lower.includes('give')
  ) {
    const entry = notebookRepository.getEntry({
      guildId,
      key: 'coins',
      memberId,
    });
    const coins = entry ? entry.value : '0';
    return `💰 You currently have **${coins} coins**.`;
  }

  // 3. Match Level queries
  if (
    /\b(?:what\s+is\s+my\s+level|my\s+level|level|\b!level\b)\b/i.test(lower) &&
    !lower.includes('set') &&
    !lower.includes('add')
  ) {
    const entry = notebookRepository.getEntry({
      guildId,
      key: 'level',
      memberId,
    });
    const level = entry ? entry.value : '1';
    return `📊 Your current level is **Level ${level}**.`;
  }

  // 4. Match Warnings queries
  if (
    /\b(?:my\s+warnings|warnings|check\s+warnings|\b!warnings\b)\b/i.test(lower) &&
    !lower.includes('set') &&
    !lower.includes('clear')
  ) {
    const entry = notebookRepository.getEntry({
      guildId,
      category: 'moderation',
      key: 'warnings',
      memberId,
    });
    const warnings = entry ? entry.value : '0';
    return `⚠️ You have **${warnings} warning(s)**.`;
  }

  return null;
}
