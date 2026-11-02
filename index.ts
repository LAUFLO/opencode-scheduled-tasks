// opencode-scheduled-tasks server entry
import { Plugin } from "@opencode/plugin"
import { ScheduledTasks, type RunRecord, type Task } from "./src/rpc.ts"
import { nextRun } from "./src/shared/schedule.ts"
import type { Schedule, TaskMode } from "./src/shared/types.ts"

const STORAGE_KEY = "tasks"
const MAX_RUNS = 20
const POLL_INTERVAL = 3_000
const RUN_TIMEOUT = 30 * 60_000
const WAKE_INTERVAL = 60_000

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

type SaveTaskInput = {
  id?: string
  name: string
  prompt: string
  directory: string
  schedule: Schedule
  enabled?: boolean
  model?: { providerID: string; id: string }
  mode?: TaskMode
  newSession?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function sanitizeSchedule(value: unknown): Schedule | undefined {
  if (!isRecord(value)) return undefined
  const kind = value.kind
  if (kind !== "daily" && kind !== "weekly" && kind !== "interval" && kind !== "once") return undefined
  const schedule: Schedule = { kind }
  if (typeof value.time === "string") schedule.time = value.time
  if (typeof value.weekday === "number") schedule.weekday = value.weekday
  if (Array.isArray(value.weekdays)) {
    const days = value.weekdays.filter(
      (day): day is number => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6,
    )
    if (days.length > 0) schedule.weekdays = [...new Set(days)].sort((a, b) => a - b)
  }
  if (typeof value.minutes === "number") schedule.minutes = value.minutes
  if (typeof value.at === "number") schedule.at = value.at
  return schedule
}

function sanitizeRuns(value: unknown): RunRecord[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((run) => {
      const status = run.status === "success" || run.status === "error" ? run.status : "error"
      const record: RunRecord = {
        at: typeof run.at === "number" ? run.at : Date.now(),
        status,
      }
      if (typeof run.sessionID === "string") record.sessionID = run.sessionID
      if (typeof run.durationMs === "number") record.durationMs = run.durationMs
      if (typeof run.error === "string") record.error = run.error
      return record
    })
    .slice(0, MAX_RUNS)
}

function sanitizeTask(value: unknown): Task | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.id !== "string" || !value.id) return undefined
  if (typeof value.name !== "string" || !value.name.trim()) return undefined
  if (typeof value.prompt !== "string" || !value.prompt.trim()) return undefined
  if (typeof value.directory !== "string" || !value.directory.trim()) return undefined
  const schedule = sanitizeSchedule(value.schedule)
  if (!schedule) return undefined

  const mode: TaskMode = value.mode === "plan" ? "plan" : "default"
  const task: Task = {
    id: value.id,
    name: value.name,
    prompt: value.prompt,
    directory: value.directory,
    schedule,
    enabled: value.enabled !== false,
    mode,
    newSession: value.newSession !== false,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
    runs: sanitizeRuns(value.runs),
  }
  if (typeof value.sessionID === "string" && value.sessionID) task.sessionID = value.sessionID
  if (isRecord(value.model) && typeof value.model.providerID === "string" && typeof value.model.id === "string") {
    task.model = { providerID: value.model.providerID, id: value.model.id }
  }
  return task
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default Plugin.define({
  id: "opencode-scheduled-tasks",
  async setup(ctx) {
    let tasks: Task[] = []
    try {
      const stored = await ctx.storage.get(STORAGE_KEY)
      if (Array.isArray(stored)) {
        tasks = stored.map(sanitizeTask).filter((task): task is Task => task !== undefined)
      }
    } catch (error) {
      console.error("[opencode-scheduled-tasks] failed to load tasks", error)
      tasks = []
    }

    const running = new Set<string>()
    const dueAt = new Map<string, number>()
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let emitting: ((reason: string, id?: string) => Promise<void>) | undefined

    const persist = async () => {
      try {
        await ctx.storage.set(STORAGE_KEY, tasks as unknown as Json)
      } catch (error) {
        console.error("[opencode-scheduled-tasks] failed to save tasks", error)
      }
    }

    const emit = (reason: string, id?: string) => {
      if (disposed || !emitting) return
      void emitting(reason, id).catch(() => undefined)
    }

    const recompute = () => {
      const now = Date.now()
      const live = new Set(tasks.map((task) => task.id))
      for (const id of [...dueAt.keys()]) {
        if (!live.has(id)) dueAt.delete(id)
      }
      for (const task of tasks) {
        if (!task.enabled) {
          dueAt.delete(task.id)
          continue
        }
        const current = dueAt.get(task.id)
        if (current === undefined || !Number.isFinite(current)) {
          const next = nextRun(task.schedule, now + 500)
          if (next === undefined) dueAt.delete(task.id)
          else dueAt.set(task.id, next)
        }
      }
    }

    const readFailure = async (sessionID: string): Promise<string | undefined> => {
      try {
        const messages = (await ctx.session.context({ sessionID })) as unknown as Array<Record<string, unknown>>
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const error = messages[index]?.error as { message?: string } | undefined
          if (error && typeof error.message === "string" && error.message) return error.message
        }
      } catch {
        // The session context is best effort; the run record still reports the outcome.
      }
      return undefined
    }

    const waitForCompletion = async (sessionID: string, startedAt: number): Promise<{ status: "success" | "error"; error?: string }> => {
      const deadline = startedAt + RUN_TIMEOUT
      while (!disposed && Date.now() < deadline) {
        await sleep(POLL_INTERVAL)
        try {
          const session = (await ctx.session.get({ sessionID })) as {
            outcome?: "succeeded" | "failed" | "interrupted"
            time?: { idle?: number }
          }
          if (session.outcome === "failed" || session.outcome === "interrupted") {
            const reason = await readFailure(sessionID)
            return { status: "error", error: reason ?? `会话结束状态：${session.outcome}` }
          }
          if (session.outcome === "succeeded" || (session.time?.idle ?? 0) >= startedAt) {
            return { status: "success" }
          }
        } catch {
          // Session may not be readable for a moment; keep polling until the deadline.
        }
      }
      return { status: "error", error: "运行超时（30 分钟）" }
    }

    const runTask = async (task: Task) => {
      if (running.has(task.id)) return
      running.add(task.id)
      const started = Date.now()
      const record: RunRecord = { at: started, status: "running" }
      task.runs = [record, ...task.runs].slice(0, MAX_RUNS)
      await persist()
      emit("run", task.id)

      try {
        let sessionID = task.newSession ? undefined : task.sessionID
        if (sessionID) {
          try {
            const existing = (await ctx.session.get({ sessionID })) as { id?: string } | undefined
            if (!existing?.id) sessionID = undefined
          } catch {
            sessionID = undefined
          }
        }
        if (!sessionID) {
          const session = await ctx.session.create({
            location: { directory: task.directory },
            title: `[定时] ${task.name}`,
            ...(task.model ? { model: task.model } : {}),
            ...(task.mode === "plan" ? { agent: "plan" } : {}),
          })
          sessionID = session.id
          task.sessionID = sessionID
          await persist()
        }
        record.sessionID = sessionID
        await ctx.session.prompt({ sessionID, text: task.prompt })
        const result = await waitForCompletion(sessionID, started)
        record.status = result.status
        if (result.error) record.error = result.error
      } catch (error) {
        record.status = "error"
        record.error = String(error)
      } finally {
        record.durationMs = Date.now() - started
        running.delete(task.id)
        await persist()
        emit("run", task.id)
        console.log(
          `[opencode-scheduled-tasks] ${task.name}: ${record.status} in ${Math.round((record.durationMs ?? 0) / 1000)}s`,
        )
      }
    }

    const tick = () => {
      if (disposed) return
      const now = Date.now()
      for (const task of tasks) {
        if (!task.enabled || running.has(task.id)) continue
        const due = dueAt.get(task.id)
        if (due === undefined || due > now) continue
        // Missed runs are skipped: the next due time is computed from now.
        const next = nextRun(task.schedule, now + 500)
        if (next === undefined) dueAt.delete(task.id)
        else dueAt.set(task.id, next)
        void runTask(task)
      }
      arm()
    }

    const arm = () => {
      if (disposed) return
      if (timer) clearTimeout(timer)
      let earliest = Infinity
      for (const due of dueAt.values()) {
        if (Number.isFinite(due) && due < earliest) earliest = due
      }
      const delay = earliest === Infinity ? WAKE_INTERVAL : Math.max(250, Math.min(earliest - Date.now(), WAKE_INTERVAL))
      timer = setTimeout(tick, delay)
    }

    recompute()

    const registration = await ctx.rpc.register(ScheduledTasks, {
      snapshot: async () => {
        recompute()
        const now = Date.now()
        return {
          now,
          running: [...running],
          tasks: tasks.map((task) => {
            const next = task.enabled ? dueAt.get(task.id) : undefined
            return next === undefined ? task : { ...task, nextRun: next }
          }),
        }
      },
      save: async (raw) => {
        const input = raw as SaveTaskInput
        const name = input.name.trim()
        const prompt = input.prompt.trim()
        const directory = input.directory.trim()
        if (!name) return { ok: false, error: "名称不能为空" }
        if (!prompt) return { ok: false, error: "说明不能为空" }
        if (!directory) return { ok: false, error: "请选择项目目录" }
        const schedule = sanitizeSchedule(input.schedule)
        if (!schedule) return { ok: false, error: "重复规则无效" }

        const now = Date.now()
        const newSession = input.newSession !== false
        const existing = input.id ? tasks.find((task) => task.id === input.id) : undefined
        const task: Task = existing
          ? {
              ...existing,
              name,
              prompt,
              directory,
              schedule,
              updatedAt: now,
              enabled: input.enabled ?? existing.enabled,
              mode: input.mode ?? existing.mode,
              newSession,
              ...(input.model ? { model: input.model } : {}),
            }
          : {
              id: crypto.randomUUID(),
              name,
              prompt,
              directory,
              schedule,
              enabled: input.enabled ?? true,
              mode: input.mode ?? "plan",
              newSession,
              createdAt: now,
              updatedAt: now,
              runs: [],
              ...(input.model ? { model: input.model } : {}),
            }

        if (!input.model) delete task.model
        if (newSession) delete task.sessionID
        if (existing) {
          const index = tasks.findIndex((item) => item.id === task.id)
          tasks[index] = task
        } else {
          tasks.push(task)
        }
        await persist()
        recompute()
        arm()
        emit("save", task.id)
        return { ok: true, id: task.id }
      },
      remove: async (raw) => {
        const { id } = raw as { id: string }
        if (running.has(id)) return { ok: false, error: "任务正在运行，稍后再删除" }
        const before = tasks.length
        tasks = tasks.filter((task) => task.id !== id)
        if (tasks.length === before) return { ok: false, error: "任务不存在" }
        dueAt.delete(id)
        await persist()
        arm()
        emit("remove", id)
        return { ok: true }
      },
      toggle: async (raw) => {
        const { id, enabled } = raw as { id: string; enabled: boolean }
        const task = tasks.find((item) => item.id === id)
        if (!task) return { ok: false, error: "任务不存在" }
        task.enabled = enabled
        task.updatedAt = Date.now()
        await persist()
        recompute()
        arm()
        emit("toggle", id)
        return { ok: true }
      },
      runNow: async (raw) => {
        const { id } = raw as { id: string }
        const task = tasks.find((item) => item.id === id)
        if (!task) return { ok: false, error: "任务不存在" }
        if (running.has(id)) return { ok: false, error: "任务正在运行" }
        void runTask(task)
        return { ok: true }
      },
    })

    emitting = async (reason, id) => {
      await registration.events.emit("changed", id ? { reason, id } : { reason })
    }

    dueAt.clear()
    recompute()
    arm()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  },
})
