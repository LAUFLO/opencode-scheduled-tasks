import { For, Show, createSignal } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"
import type { ModelRef, Schedule, TaskMode } from "../rpc.ts"
import type { ModelOption, ProjectOption, TaskDraft } from "./types"
import { Picker } from "./picker"
import { input, label, textarea } from "./theme"

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
const KINDS = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "interval", label: "按间隔" },
  { value: "once", label: "仅一次" },
]

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
  dark: boolean
  ui: Ui
  onSave: (draft: TaskDraft) => Promise<string | undefined>
  onCancel: () => void
}) {
  const Button = props.ui.Button
  const TextInput = props.ui.TextInput

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

  const selectedModel = (): ModelRef | undefined => props.models.find((item) => item.key === modelKey())?.ref

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

  const field = "display:flex;flex-direction:column;gap:6px;min-width:0;"
  const surface = () => (props.dark ? "#1f1f1f" : "#ffffff")
  const text = () => (props.dark ? "#ededed" : "#1a1a1a")
  const grid = "display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;"

  const projectOptions = () => props.projects.map((project) => ({ value: project.directory, label: project.name }))
  const modelOptions = () => [
    { value: "", label: "使用默认模型" },
    ...props.models.map((model) => ({ value: model.key, label: model.label })),
  ]

  return (
    <div
      style="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);padding:24px;"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onCancel()
      }}
    >
      <div
        style={`width:min(560px,100%);max-height:calc(100vh - 48px);overflow-y:auto;border-radius:14px;border:1px solid rgba(127,127,127,0.25);background:${surface()};color:${text()};color-scheme:${props.dark ? "dark" : "light"};box-shadow:0 24px 80px rgba(0,0,0,0.45);padding:20px;display:flex;flex-direction:column;gap:14px;`}
        onClick={(event) => event.stopPropagation()}
      >
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="font-size:15px;font-weight:600;">{props.draft.id ? "编辑定时任务" : "设置定时任务"}</div>
          <props.ui.IconButton icon="close-small" label="关闭" onClick={props.onCancel} />
        </div>

        <div style={field}>
          <span style={label}>名称</span>
          <TextInput
            label="名称"
            size="large"
            value={name()}
            placeholder="例如：每日行业动态"
            onInput={setName}
          />
        </div>

        <div style={field}>
          <span style={label}>说明</span>
          <textarea
            style={`${textarea}min-height:110px;`}
            value={prompt()}
            placeholder="描述这次运行要做什么。会作为一条新消息发给 agent。"
            onInput={(event) => setPrompt(event.currentTarget.value)}
          />
        </div>

        <div style={grid}>
          <div style={field}>
            <span style={label}>重复</span>
            <Picker
              value={kind()}
              options={KINDS}
              dark={props.dark}
              onChange={(value) => setKind(value as Schedule["kind"])}
            />
          </div>
          <Show when={kind() === "weekly"}>
            <div style={field}>
              <span style={label}>星期</span>
              <Picker
                value={String(weekday())}
                options={WEEKDAYS.map((item, index) => ({ value: String(index), label: item }))}
                dark={props.dark}
                onChange={(value) => setWeekday(Number(value))}
              />
            </div>
          </Show>
          <Show when={kind() === "daily" || kind() === "weekly"}>
            <div style={field}>
              <span style={label}>时间（本地）</span>
              <input
                style={input}
                type="time"
                value={time()}
                onInput={(event) => setTime(event.currentTarget.value)}
              />
            </div>
          </Show>
          <Show when={kind() === "interval"}>
            <div style={field}>
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
            <div style={field}>
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
          <Picker
            value={directory()}
            options={projectOptions()}
            placeholder="选择项目…"
            dark={props.dark}
            onChange={setDirectory}
          />
        </div>

        <div style={grid}>
          <div style={field}>
            <span style={label}>模型</span>
            <Picker value={modelKey()} options={modelOptions()} dark={props.dark} onChange={setModelKey} />
          </div>
          <div style={field}>
            <span style={label}>运行模式</span>
            <Picker
              value={mode()}
              options={[
                { value: "plan", label: "只读（plan）" },
                { value: "default", label: "默认（可能请求授权）" },
              ]}
              dark={props.dark}
              onChange={(value) => setMode(value as TaskMode)}
            />
          </div>
        </div>

        <Show when={error()}>
          <div style="font-size:12px;color:#ef4444;">{error()}</div>
        </Show>

        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:4px;">
          <Button variant="neutral" onClick={props.onCancel}>
            取消
          </Button>
          <Button variant="contrast" busy={saving()} onClick={() => void submit()}>
            {saving() ? "保存中…" : props.draft.id ? "保存" : "创建"}
          </Button>
        </div>
      </div>
    </div>
  )
}
