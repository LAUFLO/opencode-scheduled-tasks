export type ScheduleKind = "daily" | "weekly" | "interval" | "once"

export type Schedule = {
  kind: ScheduleKind
  /** HH:mm in local time, for daily and weekly. */
  time?: string
  /** 0 = Sunday, 6 = Saturday, for weekly. */
  weekday?: number
  /** Minutes between runs, for interval. */
  minutes?: number
  /** Epoch milliseconds, for once. */
  at?: number
}

export type RunStatus = "running" | "success" | "error"

export type RunRecord = {
  at: number
  status: RunStatus
  sessionID?: string
  durationMs?: number
  error?: string
}

export type TaskMode = "plan" | "default"

export type ModelRef = {
  providerID: string
  id: string
}

export type Task = {
  id: string
  name: string
  prompt: string
  /** Absolute project directory the run's session belongs to. */
  directory: string
  schedule: Schedule
  enabled: boolean
  model?: ModelRef
  mode: TaskMode
  createdAt: number
  updatedAt: number
  runs: RunRecord[]
}

export type TaskView = Task & {
  nextRun?: number
}

export type Snapshot = {
  now: number
  tasks: TaskView[]
  running: string[]
}

export type SaveInput = {
  id?: string
  name: string
  prompt: string
  directory: string
  schedule: Schedule
  enabled?: boolean
  model?: ModelRef
  mode?: TaskMode
}

export type ProjectOption = {
  id: string
  name: string
  directory: string
}
