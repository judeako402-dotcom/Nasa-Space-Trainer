import { remainingShiftMs, type MissionState } from '../app/state';
import type { MissionCheckpoint, MissionMetric, MissionMetrics } from '../model';

export function criticalStatus(metrics: MissionMetrics): MissionMetric | undefined {
  return (Object.keys(metrics) as MissionMetric[]).find(key => metrics[key] <= 0);
}

export function captureCheckpoint(
  mission: MissionState, reason: MissionCheckpoint['reason'], now: number,
): MissionCheckpoint {
  return {
    reason,
    metrics: { ...mission.metrics },
    completed: [...mission.completed],
    totalCompleted: mission.totalCompleted,
    position: { x: mission.playerX, y: mission.playerY },
    remainingMs: remainingShiftMs(mission, now),
    pendingDisaster: mission.pendingDisaster,
    failures: 0,
  };
}

export function restoreCheckpoint(
  mission: MissionState, checkpoint: MissionCheckpoint, now: number, failedStatus?: MissionMetric,
): boolean {
  if (failedStatus) checkpoint.failures += 1;
  const rescued = Boolean(failedStatus && checkpoint.failures >= 2);
  if (rescued) {
    for (const key of Object.keys(checkpoint.metrics) as MissionMetric[]) {
      checkpoint.metrics[key] = Math.max(checkpoint.metrics[key], 35);
    }
  }
  mission.metrics = { ...checkpoint.metrics };
  mission.completed = [...checkpoint.completed];
  mission.totalCompleted = checkpoint.totalCompleted;
  mission.playerX = checkpoint.position.x;
  mission.playerY = checkpoint.position.y;
  mission.pendingDisaster = checkpoint.pendingDisaster;
  // A task completed near the bell still leaves time to get to the next room.
  const remaining = Math.min(mission.shiftDurationMs, Math.max(30000, checkpoint.remainingMs));
  mission.dayStartedAt = now - (mission.shiftDurationMs - remaining);
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  return rescued;
}
