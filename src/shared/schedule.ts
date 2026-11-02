import type { Schedule } from "./types.ts"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

function parseTime(value: string | undefined): { hours: number; minutes: number } | undefined {
  if (!value) return undefined
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined
  return { hours, minutes }
}

function atTime(base: number, hours: number, minutes: number): number {
  const date = new Date(base)
  date.setHours(hours, minutes, 0, 0)
  return date.getTime()
}

/** The next epoch millisecond a schedule fires at or after `from`, or undefined when it never fires again. */
export function nextRun(schedule: Schedule, from: number): number | undefined {
  switch (schedule.kind) {
    case "daily": {
      const time = parseTime(schedule.time)
      if (!time) return undefined
      const today = atTime(from, time.hours, time.minutes)
      if (today > from) return today
      return atTime(from + DAY, time.hours, time.minutes)
    }
    case "weekly": {
      const time = parseTime(schedule.time)
      if (!time) return undefined
      const weekday = typeof schedule.weekday === "number" ? schedule.weekday : 1
      const target = ((weekday % 7) + 7) % 7
      const date = new Date(from)
      const current = date.getDay()
      let delta = (target - current + 7) % 7
      let candidate = atTime(from, time.hours, time.minutes)
      if (delta === 0 && candidate <= from) delta = 7
      candidate = atTime(from + delta * DAY, time.hours, time.minutes)
      if (candidate <= from) candidate = atTime(from + (delta + 7) * DAY, time.hours, time.minutes)
      return candidate
    }
    case "interval": {
      const minutes = typeof schedule.minutes === "number" ? schedule.minutes : 0
      if (minutes <= 0) return undefined
      return from + minutes * MINUTE
    }
    case "once": {
      if (typeof schedule.at !== "number" || !Number.isFinite(schedule.at)) return undefined
      return schedule.at > from ? schedule.at : undefined
    }
    default:
      return undefined
  }
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/** A short human description of a schedule, in Chinese. */
export function describeSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case "daily":
      return `每天 ${schedule.time ?? "09:00"}`
    case "weekly": {
      const weekday = typeof schedule.weekday === "number" ? schedule.weekday : 1
      return `每${WEEKDAYS[((weekday % 7) + 7) % 7]} ${schedule.time ?? "09:00"}`
    }
    case "interval": {
      const minutes = typeof schedule.minutes === "number" ? schedule.minutes : 0
      if (minutes >= 60 && minutes % 60 === 0) return `每 ${minutes / 60} 小时`
      return `每 ${minutes} 分钟`
    }
    case "once": {
      if (typeof schedule.at !== "number") return "仅一次"
      const date = new Date(schedule.at)
      return `仅一次 · ${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }
    default:
      return "未设置"
  }
}

/** A compact countdown such as `2 小时 05 分` or `明天 09:00`. */
export function formatCountdown(at: number | undefined, now = Date.now()): string {
  if (typeof at !== "number" || !Number.isFinite(at)) return "—"
  const diff = at - now
  if (diff <= 0) return "即将运行"
  const minutes = Math.floor(diff / MINUTE)
  if (minutes < 1) return "不到 1 分钟"
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest > 0 ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days} 天 ${restHours} 小时` : `${days} 天`
}

/** A compact clock such as `今天 09:00`, `明天 09:00`, or `11月05日 09:00`. */
export function formatWhen(at: number | undefined, now = Date.now()): string {
  if (typeof at !== "number" || !Number.isFinite(at)) return "—"
  const date = new Date(at)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const dayDiff = Math.floor((at - start.getTime()) / DAY)
  if (dayDiff === 0) return `今天 ${time}`
  if (dayDiff === 1) return `明天 ${time}`
  if (dayDiff === -1) return `昨天 ${time}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

export function formatDuration(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`
}
