export const DESCREEN_CONFIG = {
  GLANCE_THRESHOLD_SECONDS: 10,
  BREAK_THRESHOLD_SECONDS: 120,
} as const

export type SessionStatus =
  | 'IDLE'
  | 'ACTIVE'
  | 'GLANCE'
  | 'TOLERATED_USAGE'
  | 'INTERRUPTED'
  | 'COMPLETED'
  | 'UNVERIFIED'

export type UsageEpisodeResult = {
  status: SessionStatus
  durationSeconds: number
  violated: boolean
  usageType: 'GLANCE' | 'TOLERATED' | 'RECREATIONAL'
}

export function evaluateUsageEpisode(durationSeconds: number): UsageEpisodeResult {
  const duration = Math.max(0, Math.floor(durationSeconds))
  const violated = duration >= DESCREEN_CONFIG.BREAK_THRESHOLD_SECONDS

  return {
    status: violated
      ? 'INTERRUPTED'
      : duration > DESCREEN_CONFIG.GLANCE_THRESHOLD_SECONDS
        ? 'TOLERATED_USAGE'
        : 'ACTIVE',
    durationSeconds: duration,
    violated,
    usageType: duration <= DESCREEN_CONFIG.GLANCE_THRESHOLD_SECONDS
      ? 'GLANCE'
      : violated
        ? 'RECREATIONAL'
        : 'TOLERATED',
  }
}

export function elapsedSeconds(startedAt: string | number, now = Date.now()) {
  const start = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime()
  return Math.max(0, Math.floor((now - start) / 1000))
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}
