import { For, Show } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"
import type { TaskView } from "../rpc.ts"
import { muted, rowTitle } from "./theme"
import { TaskDetail, TaskRow } from "./task-view"

export function TasksPanel(props: {
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
  const IconButton = props.ui.IconButton

  return (
    <div style="display:flex;flex-direction:column;gap:12px;padding:12px;height:100%;box-sizing:border-box;overflow-y:auto;">
      <div style="display:flex;align-items:center;gap:8px;">
        <Show when={selected()}>
          <IconButton icon="outline-arrow-left" label="返回列表" onClick={() => props.onSelect(undefined)} />
        </Show>
        <div style={`${rowTitle}flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`}>
          {selected()?.name ?? "定时任务"}
        </div>
        <Show when={!selected()}>
          <IconButton icon="outline-rotate-clockwise" label="刷新" onClick={props.onRefresh} />
          <Button variant="contrast" size="small" onClick={props.onCreate}>
            新建
          </Button>
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
                <Button variant="neutral" size="small" onClick={props.onCreate}>
                  新建任务
                </Button>
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
  )
}
