import { For, Show } from "solid-js"
import type { TaskView } from "../rpc.ts"
import { button, muted, primaryButton, rowTitle } from "./theme"
import { TaskDetail, TaskRow } from "./task-view"

export function TasksPanel(props: {
  tasks: TaskView[]
  running: string[]
  selectedID: string | undefined
  loading: boolean
  error: string | undefined
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

  return (
    <div style="display:flex;flex-direction:column;gap:12px;padding:12px;height:100%;box-sizing:border-box;overflow-y:auto;">
      <div style="display:flex;align-items:center;gap:8px;">
        <Show when={selected()}>
          <button
            type="button"
            onClick={() => props.onSelect(undefined)}
            style={`${button}padding:0 9px;`}
            title="返回列表"
          >
            ←
          </button>
        </Show>
        <div style={`${rowTitle}flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`}>
          {selected()?.name ?? "定时任务"}
        </div>
        <Show when={!selected()}>
          <button type="button" onClick={props.onRefresh} style={`${button}padding:0 9px;`} title="刷新">
            ↻
          </button>
          <button type="button" onClick={props.onCreate} style={`${primaryButton}height:28px;padding:0 10px;`}>
            新建
          </button>
        </Show>
      </div>

      <Show when={props.error}>
        <div style="font-size:11px;color:#ef4444;white-space:pre-wrap;">{props.error}</div>
      </Show>

      <Show
        when={selected()}
        fallback={
          <Show
            when={props.tasks.length > 0}
            fallback={
              <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:28px 12px;text-align:center;">
                <div style="font-size:22px;opacity:0.45;">◷</div>
                <div style="font-size:12px;">还没有定时任务</div>
                <div style={muted}>创建一个任务，让 agent 按计划自动运行。</div>
                <button type="button" onClick={props.onCreate} style={`${button}margin-top:4px;`}>
                  新建任务
                </button>
              </div>
            }
          >
            <div style="display:flex;flex-direction:column;gap:2px;">
              <For each={props.tasks}>
                {(task) => (
                  <TaskRow
                    task={task}
                    running={isRunning(task.id)}
                    selected={false}
                    onClick={() => props.onSelect(task.id)}
                  />
                )}
              </For>
            </div>
          </Show>
        }
      >
        {(task) => (
          <TaskDetail
            task={task()}
            running={isRunning(task().id)}
            onEdit={() => props.onEdit(task().id)}
            onDelete={() => props.onDelete(task().id)}
            onRunNow={() => props.onRunNow(task().id)}
            onToggle={() => props.onToggle(task().id)}
            onOpenSession={props.onOpenSession}
          />
        )}
      </Show>
    </div>
  )
}
