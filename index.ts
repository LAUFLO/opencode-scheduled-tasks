// opencode-scheduled-tasks server entry
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Plugin } from "@opencode/plugin"
import { ScheduledTasks, type RunRecord, type Task } from "./src/rpc.ts"
import { describeSchedule, nextRun } from "./src/shared/schedule.ts"
import type { Schedule, TaskMode } from "./src/shared/types.ts"

const DATA_DIR = join(homedir(), ".config", "opencode", "scheduled-tasks")
const DATA_FILE = join(DATA_DIR, "tasks.json")
const MAX_RUNS = 20
const POLL_INTERVAL = 3_000
const RUN_TIMEOUT = 30 * 60_000
const WAKE_INTERVAL = 60_000

type Shared = {
  tasks: Task[]
  running: Set<string>
  lastTrigger: Map<string, number>
  loaded: boolean
  fileExists: boolean
  loading: Promise<void> | undefined
  writing: Promise<void>
}

const SHARED_KEY = Symbol.for("opencode-scheduled-tasks.shared")
const globalRecord = globalThis as unknown as Record<symbol, Shared | undefined>
const shared: Shared = globalRecord[SHARED_KEY] ?? {
  tasks: [],
  running: new Set<string>(),
  lastTrigger: new Map<string, number>(),
  loaded: false,
  fileExists: false,
  loading: undefined,
  writing: Promise.resolve(),
}
globalRecord[SHARED_KEY] = shared

async function loadShared(): Promise<void> {
  if (shared.loaded) return
  if (!shared.loading) {
    shared.loading = (async () => {
      try {
        const text = await readFile(DATA_FILE, "utf8")
        shared.fileExists = true
        const parsed: unknown = JSON.parse(text)
        if (Array.isArray(parsed)) {
          shared.tasks = parsed.map(sanitizeTask).filter((task): task is Task => task !== undefined)
        }
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") {
          console.error("[opencode-scheduled-tasks] failed to load tasks", error)
        }
      }
      shared.loaded = true
      shared.loading = undefined
    })()
  }
  await shared.loading
}

function persistShared(): Promise<void> {
  const snapshot = shared.tasks.map((task) => ({ ...task }))
  shared.writing = shared.writing.then(async () => {
    try {
      await mkdir(DATA_DIR, { recursive: true })
      const temp = `${DATA_FILE}.tmp`
      await writeFile(temp, JSON.stringify(snapshot, null, 2), "utf8")
      await rename(temp, DATA_FILE)
      shared.fileExists = true
    } catch (error) {
      console.error("[opencode-scheduled-tasks] failed to save tasks", error)
    }
  })
  return shared.writing
}

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
    await loadShared()
    // Hot reload keeps the cached shared object, which may predate `fileExists`.
    // Infer it from the in-memory list instead of migrating a second time.
    if (typeof (shared as { fileExists?: boolean }).fileExists !== "boolean") {
      shared.fileExists = shared.tasks.length > 0
    }
    // Only migrate when the global store has never been created. An empty array
    // means the user deleted their tasks, and must not resurrect old ones.
    if (!shared.fileExists) {
      try {
        const stored = await ctx.storage.get("tasks")
        if (Array.isArray(stored)) {
          const known = new Set(shared.tasks.map((task) => task.id))
          const migrated = stored
            .map(sanitizeTask)
            .filter((task): task is Task => task !== undefined && !known.has(task.id))
          if (migrated.length > 0) {
            shared.tasks.push(...migrated)
            await persistShared()
          }
        }
      } catch {
        // No old per-project store; nothing to migrate.
      }
    }
    const tasks = shared.tasks
    const running = shared.running

    const dueAt = new Map<string, number>()
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let emitting: ((reason: string, id?: string) => Promise<void>) | undefined

    const persist = () => persistShared()

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
        // Every project has its own plugin instance; only one of them runs a due task.
        const last = shared.lastTrigger.get(task.id) ?? 0
        if (last >= due) continue
        shared.lastTrigger.set(task.id, now)
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

    const saveTask = async (input: SaveTaskInput): Promise<{ ok: boolean; id?: string; error?: string }> => {
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
    }

    const removeTask = async (id: string): Promise<{ ok: boolean; error?: string }> => {
      if (running.has(id)) return { ok: false, error: "任务正在运行，稍后再删除" }
      const index = tasks.findIndex((task) => task.id === id)
      if (index < 0) return { ok: false, error: "任务不存在" }
      tasks.splice(index, 1)
      dueAt.delete(id)
      await persist()
      arm()
      emit("remove", id)
      return { ok: true }
    }

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
      save: async (raw) => saveTask(raw as SaveTaskInput),
      remove: async (raw) => removeTask((raw as { id: string }).id),
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

    const resolveDirectory = async (value: string | undefined, sessionID: string): Promise<string | undefined> => {
      const explicit = value?.trim()
      if (explicit) return explicit
      try {
        const session = (await ctx.session.get({ sessionID: sessionID as never })) as {
          location?: { directory?: string }
        }
        return session.location?.directory
      } catch {
        return undefined
      }
    }

    const scheduleFromTool = (input: {
      kind?: string
      time?: string
      weekdays?: number[]
      minutes?: number
      at?: string
    }): Schedule | undefined => {
      const kind = input.kind
      if (kind !== "daily" && kind !== "weekly" && kind !== "interval" && kind !== "once") return undefined
      const schedule: Schedule = { kind }
      if (input.time) schedule.time = input.time
      if (Array.isArray(input.weekdays) && input.weekdays.length > 0) schedule.weekdays = input.weekdays
      if (typeof input.minutes === "number") schedule.minutes = input.minutes
      if (input.at) {
        const at = Date.parse(input.at)
        if (Number.isFinite(at)) schedule.at = at
      }
      return schedule
    }

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "scheduled_task_create",
        description:
          "Create a scheduled task that sends a prompt to an agent on a schedule on this machine. Use when the user asks to run something every day, every week, every N minutes, or once at a time. " +
          "The prompt is sent verbatim as a user message in a new session (or a reused one when newSession is false).",
        input: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short task name shown in the task list." },
            prompt: {
              type: "string",
              description: "The instruction sent to the agent on every run. Write it as a complete prompt.",
            },
            kind: {
              type: "string",
              enum: ["daily", "weekly", "interval", "once"],
              description: "daily, weekly, every N minutes, or a single run.",
            },
            time: { type: "string", description: "HH:mm in local time, for daily and weekly." },
            weekdays: {
              type: "array",
              items: { type: "number" },
              description: "For weekly: 0 = Sunday through 6 = Saturday. Several days allowed.",
            },
            minutes: { type: "number", description: "For interval: minutes between runs." },
            at: { type: "string", description: "For once: an ISO date-time or a parseable date string." },
            directory: {
              type: "string",
              description: "Absolute project directory. Omit to use the current session's project.",
            },
            model: { type: "string", description: "Optional model as providerID/modelID." },
            mode: {
              type: "string",
              enum: ["plan", "default"],
              description: "plan runs read-only; default lets the agent modify files.",
            },
            newSession: {
              type: "boolean",
              description: "Create a new session on every run. Set false to reuse one session for frequent runs.",
            },
          },
          required: ["name", "prompt", "kind"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as {
            name: string
            prompt: string
            kind: string
            time?: string
            weekdays?: number[]
            minutes?: number
            at?: string
            directory?: string
            model?: string
            mode?: "plan" | "default"
            newSession?: boolean
          }
          const schedule = scheduleFromTool(input)
          if (!schedule) return { content: "创建失败：重复规则无效，请选择 daily、weekly、interval 或 once。" }

          const directory = await resolveDirectory(input.directory, toolContext.sessionID)
          if (!directory) {
            return { content: "创建失败：没有项目目录。请让用户指定一个项目路径，或先打开一个会话。" }
          }

          let model: { providerID: string; id: string } | undefined
          if (input.model && input.model.includes("/")) {
            const index = input.model.indexOf("/")
            model = { providerID: input.model.slice(0, index), id: input.model.slice(index + 1) }
          }

          const result = await saveTask({
            name: input.name,
            prompt: input.prompt,
            directory,
            schedule,
            mode: input.mode ?? "plan",
            newSession: input.newSession !== false,
            ...(model ? { model } : {}),
          })
          if (!result.ok) return { content: `创建失败：${result.error ?? "未知错误"}` }

          const task = tasks.find((item) => item.id === result.id)
          const next = task ? dueAt.get(task.id) : undefined
          const when = next ? new Date(next).toLocaleString("zh-CN", { hour12: false }) : "不会触发"
          return {
            content: `已创建定时任务「${task?.name ?? input.name}」：${task ? describeSchedule(task.schedule) : ""}，下次运行 ${when}。`,
            metadata: { id: result.id ?? "", directory },
          }
        },
      })

      editor.add({
        name: "scheduled_task_list",
        description: "List the scheduled tasks on this machine with their schedule, status and next run.",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => {
          recompute()
          if (tasks.length === 0) return { content: "当前没有定时任务。" }
          const lines = tasks.map((task) => {
            const next = task.enabled ? dueAt.get(task.id) : undefined
            const state = !task.enabled ? "已暂停" : next ? `下次 ${new Date(next).toLocaleString("zh-CN", { hour12: false })}` : "待运行"
            return `- ${task.name}（id: ${task.id}）：${describeSchedule(task.schedule)}，${state}`
          })
          return { content: lines.join("\n"), metadata: { count: tasks.length } }
        },
      })

      editor.add({
        name: "scheduled_task_delete",
        description: "Delete a scheduled task by id or by its exact name.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Task id from scheduled_task_list." },
            name: { type: "string", description: "Exact task name, used when id is omitted." },
          },
          additionalProperties: false,
        },
        execute: async (raw) => {
          const input = raw as { id?: string; name?: string }
          const task = input.id
            ? tasks.find((item) => item.id === input.id)
            : input.name
              ? tasks.find((item) => item.name === input.name)
              : undefined
          if (!task) return { content: "删除失败：没有找到匹配的任务，请先用 scheduled_task_list 查看。" }
          const result = await removeTask(task.id)
          if (!result.ok) return { content: `删除失败：${result.error ?? "未知错误"}` }
          return { content: `已删除定时任务「${task.name}」。` }
        },
      })

      editor.add({
        name: "scheduled_task_run",
        description: "Run a scheduled task immediately, without waiting for its next scheduled time.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Task id from scheduled_task_list." },
            name: { type: "string", description: "Exact task name, used when id is omitted." },
          },
          additionalProperties: false,
        },
        execute: async (raw) => {
          const input = raw as { id?: string; name?: string }
          const task = input.id
            ? tasks.find((item) => item.id === input.id)
            : input.name
              ? tasks.find((item) => item.name === input.name)
              : undefined
          if (!task) return { content: "运行失败：没有找到匹配的任务。" }
          if (running.has(task.id)) return { content: `任务「${task.name}」正在运行。` }
          void runTask(task)
          return { content: `已开始运行「${task.name}」，结果会记录在任务的运行历史里。` }
        },
      })
    })

    dueAt.clear()
    recompute()
    arm()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  },
})
