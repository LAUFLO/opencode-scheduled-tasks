import { Rpc } from "@opencode/plugin/rpc"

export type ScheduleKind = "daily" | "weekly" | "interval" | "once"
export type RunStatus = "running" | "success" | "error"
export type TaskMode = "plan" | "default"

export type Schedule = {
  kind: ScheduleKind
  time?: string
  weekday?: number
  weekdays?: number[]
  minutes?: number
  at?: number
}

export type RunRecord = {
  at: number
  status: RunStatus
  sessionID?: string
  durationMs?: number
  error?: string
}

export type ModelRef = {
  providerID: string
  id: string
}

export type Task = {
  id: string
  name: string
  prompt: string
  directory: string
  schedule: Schedule
  enabled: boolean
  model?: ModelRef
  mode: TaskMode
  /** Create a fresh session on every run. False reuses `sessionID`. */
  newSession: boolean
  /** The reused session for repeated runs. */
  sessionID?: string
  createdAt: number
  updatedAt: number
  runs: RunRecord[]
}

export type TaskView = Task & { nextRun?: number }

export type Snapshot = {
  now: number
  tasks: TaskView[]
  running: string[]
}

const ScheduleSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["daily", "weekly", "interval", "once"] },
    time: { type: "string" },
    weekday: { type: "number" },
    weekdays: { type: "array", items: { type: "number" } },
    minutes: { type: "number" },
    at: { type: "number" },
  },
  required: ["kind"],
  additionalProperties: false,
}

const RunSchema = {
  type: "object",
  properties: {
    at: { type: "number" },
    status: { type: "string", enum: ["running", "success", "error"] },
    sessionID: { type: "string" },
    durationMs: { type: "number" },
    error: { type: "string" },
  },
  required: ["at", "status"],
  additionalProperties: false,
}

const ModelSchema = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    id: { type: "string" },
  },
  required: ["providerID", "id"],
  additionalProperties: false,
}

const TaskSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    prompt: { type: "string" },
    directory: { type: "string" },
    schedule: ScheduleSchema,
    enabled: { type: "boolean" },
    model: ModelSchema,
    mode: { type: "string", enum: ["plan", "default"] },
    newSession: { type: "boolean" },
    sessionID: { type: "string" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
    runs: { type: "array", items: RunSchema },
    nextRun: { type: "number" },
  },
  required: ["id", "name", "prompt", "directory", "schedule", "enabled", "mode", "newSession", "createdAt", "updatedAt", "runs"],
  additionalProperties: false,
}

export const ScheduledTasks = Rpc.define({
  id: "opencode-scheduled-tasks",
  methods: {
    snapshot: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          now: { type: "number" },
          tasks: { type: "array", items: TaskSchema },
          running: { type: "array", items: { type: "string" } },
        },
        required: ["now", "tasks", "running"],
        additionalProperties: false,
      },
    },
    save: {
      input: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          prompt: { type: "string" },
          directory: { type: "string" },
          schedule: ScheduleSchema,
          enabled: { type: "boolean" },
          model: ModelSchema,
          mode: { type: "string", enum: ["plan", "default"] },
          newSession: { type: "boolean" },
        },
        required: ["name", "prompt", "directory", "schedule"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          id: { type: "string" },
          error: { type: "string" },
        },
        required: ["ok"],
        additionalProperties: false,
      },
    },
    remove: {
      input: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { ok: { type: "boolean" }, error: { type: "string" } },
        required: ["ok"],
        additionalProperties: false,
      },
    },
    toggle: {
      input: {
        type: "object",
        properties: { id: { type: "string" }, enabled: { type: "boolean" } },
        required: ["id", "enabled"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { ok: { type: "boolean" }, error: { type: "string" } },
        required: ["ok"],
        additionalProperties: false,
      },
    },
    runNow: {
      input: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { ok: { type: "boolean" }, error: { type: "string" } },
        required: ["ok"],
        additionalProperties: false,
      },
    },
  },
  events: {
    changed: {
      schema: {
        type: "object",
        properties: {
          reason: { type: "string" },
          id: { type: "string" },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
})
