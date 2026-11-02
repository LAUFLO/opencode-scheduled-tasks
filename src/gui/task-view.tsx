import { For, Show } from "solid-js"
import type { TaskView } from "../rpc.ts"
import { describeSchedule, formatCountdown, formatDuration, formatWhen } from "../shared/schedule.ts"
import { button, dangerButton, dot, label, mono, muted, rowTitle } from "./theme"

function statusColor(task: TaskView, running: boolean): string {
  if (running) return "#f59e0b"
  if (!task.enabled) return "rgba(127,127,127,0.5)"
  const last = task.runs[0]
  if (!last) return "#22c55e"
  if (last.status === "error") return "#ef4444"
  if (last.status === "running") return "#f59e0b"
  return "#22c55e"
}

function statusText(task: TaskView, running: boolean): string {
  if (running) return "运行中"
  if (!task.enabled) return "已暂停"
  const last = task.runs[0]
  if (!last) return "待运行"
  if (last.status === "error") return "上次失败"
  if (last.status === "running") return "运行中"
  return "上次成功"
}

export function TaskRow(props: { task: TaskView; running: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={`display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;text-align:left;padding:10px;border-radius:9px;border:1px solid ${
        props.selected ? "rgba(34,197,94,0.45)" : "transparent"
      };background:${props.selected ? "rgba(34,197,94,0.08)" : "transparent"};color:inherit;cursor:pointer;`}
    >
      <span style={`${dot(statusColor(props.task, props.running))}margin-top:5px;`} />
      <span style="display:flex;flex-direction:column;gap:3px;min-width:0;flex:1;">
        <span style={`${rowTitle}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`}>{props.task.name}</span>
        <span style={`${muted}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`}>
          {describeSchedule(props.task.schedule)}
          <Show when={props.task.enabled && props.task.nextRun}>
            {" · "}下次 {formatWhen(props.task.nextRun, Date.now())}
          </Show>
        </span>
      </span>
      <span style={`${muted}white-space:nowrap;flex-shrink:0;`}>{statusText(props.task, props.running)}</span>
    </button>
  )
}

export function TaskDetail(props: {
  task: TaskView
  running: boolean
  onEdit: () => void
  onDelete: () => void
  onRunNow: () => void
  onToggle: () => void
  onOpenSession: (sessionID: string) => void
}) {
  const last = () => props.task.runs[0]

  return (
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style={rowTitle}>{props.task.name}</span>
          <span style={`${muted}display:flex;align-items:center;gap:5px;`}>
            <span style={dot(statusColor(props.task, props.running))} />
            {statusText(props.task, props.running)}
          </span>
        </div>
        <div style={muted}>{describeSchedule(props.task.schedule)}</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span style={label}>下次运行</span>
          <span style="font-size:12px;">
            {props.task.enabled && props.task.nextRun
              ? `${formatWhen(props.task.nextRun, Date.now())} · ${formatCountdown(props.task.nextRun, Date.now())}后`
              : props.task.enabled
                ? "—"
                : "已暂停"}
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span style={label}>上次运行</span>
          <span style="font-size:12px;">
            {last() ? `${formatWhen(last().at, Date.now())} · ${formatDuration(last().durationMs)}` : "从未运行"}
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span style={label}>项目</span>
          <span style={`font-size:12px;${mono}word-break:break-all;`}>{props.task.directory}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span style={label}>模式</span>
          <span style="font-size:12px;">{props.task.mode === "plan" ? "只读（plan）" : "默认"}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span style={label}>模型</span>
          <span style="font-size:12px;">
            {props.task.model ? `${props.task.model.providerID} / ${props.task.model.id}` : "默认"}
          </span>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:5px;">
        <span style={label}>说明</span>
        <div
          style="font-size:12px;line-height:1.55;white-space:pre-wrap;border-radius:8px;border:1px solid rgba(127,127,127,0.18);padding:10px;max-height:180px;overflow-y:auto;"
        >
          {props.task.prompt}
        </div>
      </div>

      <Show when={last()?.error}>
        <div style="font-size:12px;color:#ef4444;white-space:pre-wrap;border-radius:8px;border:1px solid rgba(239,68,68,0.3);padding:8px;">
          {last().error}
        </div>
      </Show>

      <div style="display:flex;gap:7px;flex-wrap:wrap;">
        <button type="button" style={button} onClick={props.onRunNow} disabled={props.running}>
          {props.running ? "运行中…" : "立即运行"}
        </button>
        <button type="button" style={button} onClick={props.onToggle}>
          {props.task.enabled ? "暂停" : "启用"}
        </button>
        <button type="button" style={button} onClick={props.onEdit}>
          编辑
        </button>
        <button type="button" style={dangerButton} onClick={props.onDelete}>
          删除
        </button>
      </div>

      <Show when={props.task.runs.length > 0}>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <span style={label}>运行历史</span>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <For each={props.task.runs.slice(0, 10)}>
              {(run) => (
                <div style="display:flex;align-items:center;gap:8px;font-size:11px;opacity:0.75;padding:4px 0;">
                  <span style={dot(run.status === "error" ? "#ef4444" : run.status === "running" ? "#f59e0b" : "#22c55e")} />
                  <span style="white-space:nowrap;">{formatWhen(run.at, Date.now())}</span>
                  <span style="opacity:0.6;">{formatDuration(run.durationMs)}</span>
                  <Show when={run.sessionID}>
                    <button
                      type="button"
                      onClick={() => props.onOpenSession(run.sessionID!)}
                      style="margin-left:auto;background:none;border:none;color:inherit;font-size:11px;cursor:pointer;opacity:0.7;text-decoration:underline;padding:0;"
                    >
                      打开会话
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}

export { statusColor, statusText }
