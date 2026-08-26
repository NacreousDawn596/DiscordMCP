import { Cron } from 'croner';
import { automationRepository } from '../database/repositories/automationRepository.js';
import { getLogger } from '../logging/logger.js';

export type ScheduledRunner = (
  guildId: string,
  actionDescription: string,
  channelId: string | null,
) => Promise<void>;

export interface ScheduledJob {
  cron: Cron;
  taskId: number;
  guildId: string;
}

/**
 * Persistent scheduler backed by the scheduled_tasks table. Rebuilds jobs on
 * start and can be refreshed after configuration changes.
 */
export class Scheduler {
  private runner: ScheduledRunner | null = null;
  private jobs = new Map<number, Cron>();

  setRunner(runner: ScheduledRunner): void {
    this.runner = runner;
  }

  start(): void {
    this.rebuild();
  }

  rebuild(): void {
    for (const [, job] of this.jobs) job.stop();
    this.jobs.clear();

    const tasks = automationRepository.listScheduledTasks();
    for (const task of tasks) {
      if (!task.enabled) continue;
      this.schedule(task.id, task.guildId, task.cron, task.channelId, task.action);
    }

    getLogger().info({ count: this.jobs.size }, 'scheduler rebuilt');
  }

  private schedule(
    id: number,
    guildId: string,
    cronExpr: string,
    channelId: string | null,
    action: string,
  ): void {
    try {
      const cron = new Cron(cronExpr, () => {
        void this.fire(id, guildId, channelId, action);
      });
      this.jobs.set(id, cron);
    } catch (err) {
      getLogger().error({ err, cron: cronExpr, guildId }, 'invalid cron expression');
    }
  }

  private async fire(
    id: number,
    guildId: string,
    channelId: string | null,
    action: string,
  ): Promise<void> {
    if (!this.runner) return;
    let description = '';
    try {
      description = String(JSON.parse(action).description ?? '');
    } catch {
      description = action;
    }
    getLogger().info({ guildId, taskId: id }, 'scheduled task fired');
    try {
      await this.runner(guildId, description, channelId);
      automationRepository.touchScheduledTask(guildId, id);
    } catch (err) {
      getLogger().error({ err, guildId, taskId: id }, 'scheduled task failed');
    }
  }

  stop(): void {
    for (const [, job] of this.jobs) job.stop();
    this.jobs.clear();
  }
}

export const scheduler = new Scheduler();
