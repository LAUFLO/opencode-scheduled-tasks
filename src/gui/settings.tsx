import { For, Show } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"
import type { TaskView } from "../rpc.ts"
import { formatWhen } from "../shared/schedule.ts"
import { card, muted } from "./theme"
import { TaskDetail, TaskRow } from "./task-view"

function Metric(props: { label: string; value: string }) {
  return (
    <span style="display:flex;align-items:baseline;gap:6px;white-space:nowrap;">
      <span style={muted}>{props.label}</span>
      <span style="font-size:13px;font-weight:600;">{props.value}</span>
    </span>
  )
}

export function TasksSettings(props: {
  tasks: TaskView[]
  running: string[]
  selectedID: string | undefined
  loading: boolean
  error: string | undefined
  ui: Ui
  onSelect: (id: string | undefined) => void
  onCreate: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onRunNow: (id: string) => void
  onToggle: (id: string) => void
  onOpenSession: (sessionID: string) => void
  onRefresh: () => void
}) {
  const selected = () => props.tasks.find((task) => task.id === props.selectedID)
  const isRunning = (id: string) => props.running.includes(id)
  const Button = props.ui.Button
  const active = () => props.tasks.filter((task) => task.enabled).length
  const next = () => {
    const times = props.tasks.filter((task) => task.enabled && task.nextRun).map((task) => task.nextRun!)
    return times.length > 0 ? Math.min(...times) : undefined
  }

  return (
    <div style="display:flex;flex-direction:column;gap:18px;padding:24px;max-width:1100px;">
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
            <div style="font-size:20px;font-weight:600;letter-spacing:-0.01em;">定时任务</div>
            <div style={muted}>让 agent 按计划自动运行一段说明，结果保存在独立会话里。</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;">
            <Button variant="neutral" onClick={props.onRefresh}>
              刷新
            </Button>
            <Button variant="contrast" onClick={props.onCreate}>
              新建任务
            </Button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <Metric label="任务" value={String(props.tasks.length)} />
          <Metric label="已启用" value={String(active())} />
          <Metric label="运行中" value={String(props.running.length)} />
          <Metric label="下次运行" value={next() ? formatWhen(next(), Date.now()) : "—"} />
        </div>
      </div>

      <Show when={props.error}>
        <div style="font-size:12px;color:#ef4444;white-space:pre-wrap;">{props.error}</div>
      </Show>

      <Show
        when={props.tasks.length > 0}
        fallback={
          <div
            style={`${card}padding:48px 24px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;`}
          >
            <div style="font-size:30px;opacity:0.4;">◷</div>
            <div style="font-size:14px;font-weight:600;">还没有定时任务</div>
            <div style={muted}>创建一个任务，例如每天早上汇总行业动态。</div>
            <div style="margin-top:8px;">
              <Button variant="contrast" onClick={props.onCreate}>
                新建任务
              </Button>
            </div>
          </div>
        }
      >
        <div style="display:grid;grid-template-columns:minmax(240px,300px) minmax(0,1fr);gap:14px;align-items:start;">
          <div style={`${card}padding:8px;display:flex;flex-direction:column;gap:2px;`}>
            <For each={props.tasks}>
              {(task) => (
                <TaskRow
                  task={task}
                  running={isRunning(task.id)}
                  selected={task.id === props.selectedID}
                  onClick={() => props.onSelect(task.id)}
                />
              )}
            </For>
          </div>

          <div style={`${card}padding:18px;box-sizing:border-box;`}>
            <Show
              when={selected()}
              fallback={
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:32px 0;min-height:180px;">
                  <div style="font-size:24px;opacity:0.35;">◷</div>
                  <div style="font-size:13px;font-weight:600;">选择一个任务</div>
                  <div style={muted}>从左侧列表中查看详情、立即运行或编辑。</div>
                </div>
              }
            >
              {(task) => (
                <TaskDetail
                  task={task()}
                  running={isRunning(task().id)}
                  ui={props.ui}
                  onEdit={() => props.onEdit(task().id)}
                  onDelete={() => props.onDelete(task().id)}
                  onRunNow={() => props.onRunNow(task().id)}
                  onToggle={() => props.onToggle(task().id)}
                  onOpenSession={props.onOpenSession}
                />
              )}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
