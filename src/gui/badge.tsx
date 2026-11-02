import { Show } from "solid-js"
import type { TaskView } from "../rpc.ts"
import { formatCountdown } from "../shared/schedule.ts"
import { dot } from "./theme"

export function TasksBadge(props: { tasks: TaskView[]; running: string[]; onOpen: () => void }) {
  const next = () => {
    const times = props.tasks.filter((task) => task.enabled && task.nextRun).map((task) => task.nextRun!)
    return times.length > 0 ? Math.min(...times) : undefined
  }
  const visible = () => props.running.length > 0 || next() !== undefined

  return (
    <Show when={visible()}>
      <button
        type="button"
        onClick={props.onOpen}
        title="打开定时任务"
        style="display:flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;border:1px solid rgba(127,127,127,0.25);background:transparent;color:inherit;font-size:11px;cursor:pointer;opacity:0.85;"
      >
        <Show
          when={props.running.length > 0}
          fallback={
            <>
              <span style={dot("#22c55e")} />
              <span>{next() ? formatCountdown(next()) : ""}</span>
            </>
          }
        >
          <span style={dot("#f59e0b")} />
          <span>{props.running.length} 运行中</span>
        </Show>
      </button>
    </Show>
  )
}
