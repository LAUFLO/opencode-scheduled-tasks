import type { ModelRef, RunRecord, Schedule, TaskMode, TaskView } from "../rpc.ts"

export type ProjectOption = {
  id: string
  name: string
  directory: string
}

export type ModelOption = {
  key: string
  label: string
  ref: ModelRef
}

export type TaskDraft = {
  id?: string
  name: string
  prompt: string
  directory: string
  schedule: Schedule
  enabled: boolean
  model?: ModelRef
  mode: TaskMode
}

export type Snapshot = {
  now: number
  tasks: TaskView[]
  running: string[]
}

export type SaveResult = {
  ok: boolean
  id?: string
  error?: string
}

export type Action = (id: string) => Promise<{ ok: boolean; error?: string }>

export type RunRecordView = RunRecord
