import { For, Show, createSignal } from "solid-js"
import type { ModelRef, Schedule, TaskMode } from "../rpc.ts"
import type { ModelOption, ProjectOption, TaskDraft } from "./types"
import { button, input, label, primaryButton, select } from "./theme"

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function toLocalInput(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function TaskEditor(props: {
  draft: TaskDraft
  projects: ProjectOption[]
  models: ModelOption[]
  onSave: (draft: TaskDraft) => Promise<string | undefined>
  onCancel: () => void
}) {
  const [name, setName] = createSignal(props.draft.name)
  const [prompt, setPrompt] = createSignal(props.draft.prompt)
  const [directory, setDirectory] = createSignal(props.draft.directory)
  const [kind, setKind] = createSignal(props.draft.schedule.kind)
  const [time, setTime] = createSignal(props.draft.schedule.time ?? "09:00")
  const [weekday, setWeekday] = createSignal(props.draft.schedule.weekday ?? 1)
  const [minutes, setMinutes] = createSignal(props.draft.schedule.minutes ?? 60)
  const [onceAt, setOnceAt] = createSignal(props.draft.schedule.at ?? Date.now() + 60 * 60_000)
  const [mode, setMode] = createSignal<TaskMode>(props.draft.mode)
  const [modelKey, setModelKey] = createSignal(
    props.draft.model ? `${props.draft.model.providerID}/${props.draft.model.id}` : "",
  )
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()

  const schedule = (): Schedule => {
    switch (kind()) {
      case "daily":
        return { kind: "daily", time: time() }
      case "weekly":
        return { kind: "weekly", weekday: weekday(), time: time() }
      case "interval":
        return { kind: "interval", minutes: Math.max(1, Math.round(minutes())) }
      case "once":
        return { kind: "once", at: onceAt() }
      default:
        return { kind: "daily", time: "09:00" }
    }
  }

  const selectedModel = (): ModelRef | undefined => {
    const option = props.models.find((item) => item.key === modelKey())
    return option?.ref
  }

  const submit = async () => {
    if (saving()) return
    if (!name().trim()) {
      setError("请填写任务名称")
      return
    }
    if (!prompt().trim()) {
      setError("请填写要执行的说明")
      return
    }
    if (!directory().trim()) {
      setError("请选择项目")
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const failure = await props.onSave({
        id: props.draft.id,
        name: name().trim(),
        prompt: prompt().trim(),
        directory: directory(),
        schedule: schedule(),
        enabled: props.draft.enabled,
        model: selectedModel(),
        mode: mode(),
      })
      if (failure) setError(failure)
    } finally {
      setSaving(false)
    }
  }

  const field = "display:flex;flex-direction:column;gap:6px;"

  return (
    <div
      style="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);padding:24px;"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onCancel()
      }}
    >
      <div
        style="width:min(560px,100%);max-height:calc(100vh - 48px);overflow-y:auto;border-radius:14px;border:1px solid rgba(127,127,127,0.25);background:var(--v2-surface,#1b1b1b);box-shadow:0 24px 80px rgba(0,0,0,0.45);padding:20px;display:flex;flex-direction:column;gap:14px;"
        onClick={(event) => event.stopPropagation()}
      >
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="font-size:15px;font-weight:600;">{props.draft.id ? "编辑定时任务" : "设置定时任务"}</div>
          <button type="button" onClick={props.onCancel} style={`${button}padding:0 9px;`} title="关闭">
            ✕
          </button>
        </div>

        <div style={field}>
          <span style={label}>名称</span>
          <input
            style={input}
            value={name()}
            placeholder="例如：每日行业动态"
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </div>

        <div style={field}>
          <span style={label}>说明</span>
          <textarea
            style={`${input}min-height:110px;resize:vertical;line-height:1.5;`}
            value={prompt()}
            placeholder="描述这次运行要做什么。会作为一条新消息发给 agent。"
            onInput={(event) => setPrompt(event.currentTarget.value)}
          />
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <div style={`${field}flex:1;min-width:150px;`}>
            <span style={label}>重复</span>
            <select style={select} value={kind()} onChange={(event) => setKind(event.currentTarget.value as Schedule["kind"])}>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="interval">按间隔</option>
              <option value="once">仅一次</option>
            </select>
          </div>
          <Show when={kind() === "weekly"}>
            <div style={`${field}flex:1;min-width:120px;`}>
              <span style={label}>星期</span>
              <select style={select} value={String(weekday())} onChange={(event) => setWeekday(Number(event.currentTarget.value))}>
                <For each={WEEKDAYS}>{(item, index) => <option value={String(index())}>{item}</option>}</For>
              </select>
            </div>
          </Show>
          <Show when={kind() === "daily" || kind() === "weekly"}>
            <div style={`${field}flex:1;min-width:120px;`}>
              <span style={label}>时间（本地）</span>
              <input style={input} type="time" value={time()} onInput={(event) => setTime(event.currentTarget.value)} />
            </div>
          </Show>
          <Show when={kind() === "interval"}>
            <div style={`${field}flex:1;min-width:120px;`}>
              <span style={label}>间隔（分钟）</span>
              <input
                style={input}
                type="number"
                min="1"
                value={String(minutes())}
                onInput={(event) => setMinutes(Number(event.currentTarget.value) || 1)}
              />
            </div>
          </Show>
          <Show when={kind() === "once"}>
            <div style={`${field}flex:1;min-width:180px;`}>
              <span style={label}>运行时间（本地）</span>
              <input
                style={input}
                type="datetime-local"
                value={toLocalInput(onceAt())}
                onInput={(event) => {
                  const value = new Date(event.currentTarget.value).getTime()
                  if (Number.isFinite(value)) setOnceAt(value)
                }}
              />
            </div>
          </Show>
        </div>

        <div style={field}>
          <span style={label}>项目</span>
          <select style={select} value={directory()} onChange={(event) => setDirectory(event.currentTarget.value)}>
            <option value="">选择项目…</option>
            <For each={props.projects}>
              {(project) => <option value={project.directory}>{project.name}</option>}
            </For>
          </select>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <div style={`${field}flex:1;min-width:150px;`}>
            <span style={label}>模型</span>
            <select style={select} value={modelKey()} onChange={(event) => setModelKey(event.currentTarget.value)}>
              <option value="">使用默认模型</option>
              <For each={props.models}>{(model) => <option value={model.key}>{model.label}</option>}</For>
            </select>
          </div>
          <div style={`${field}flex:1;min-width:150px;`}>
            <span style={label}>运行模式</span>
            <select style={select} value={mode()} onChange={(event) => setMode(event.currentTarget.value as TaskMode)}>
              <option value="plan">只读（plan）</option>
              <option value="default">默认（可能请求授权）</option>
            </select>
          </div>
        </div>

        <Show when={error()}>
          <div style="font-size:12px;color:#ef4444;">{error()}</div>
        </Show>

        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:4px;">
          <button type="button" style={button} onClick={props.onCancel}>
            取消
          </button>
          <button type="button" style={primaryButton} onClick={() => void submit()} disabled={saving()}>
            {saving() ? "保存中…" : props.draft.id ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  )
}
