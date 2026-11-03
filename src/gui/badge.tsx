import { Show, createSignal } from "solid-js"
import { formatCountdown } from "../shared/schedule.ts"
import type { TaskView } from "../rpc.ts"
import { dot } from "./theme"
import { TasksPopover } from "./popover.tsx"

export function TasksBadge(props: {
  tasks: TaskView[]
  running: string[]
  dark: boolean
  onOpenTask: (id: string) => void
  onCreate: () => void
  onManage: () => void
}) {
  const [open, setOpen] = createSignal(false)
  const [trigger, setTrigger] = createSignal<HTMLButtonElement>()

  const next = () => {
    const times = props.tasks
      .filter((task) => task.enabled && task.nextRun)
      .map((task) => task.nextRun!)
    return times.length > 0 ? Math.min(...times) : undefined
  }

  const close = () => {
    setOpen(false)
    trigger()?.focus()
  }

  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        onClick={() => setOpen(!open())}
        title="定时任务"
        aria-haspopup="dialog"
        aria-expanded={open()}
        style="display:flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;border:1px solid rgba(127,127,127,0.25);background:transparent;color:inherit;font-size:11px;cursor:pointer;opacity:0.85;"
      >
        <Show
          when={props.running.length > 0}
          fallback={
            <Show
              when={next()}
              fallback={
                <>
                  <span style={dot("rgba(127,127,127,0.55)")} />
                  <span style="opacity:0.7;">定时</span>
                </>
              }
            >
              <span style={dot("#22c55e")} />
              <span>{formatCountdown(next())}</span>
            </Show>
          }
        >
          <span style={dot("#f59e0b")} />
          <span>{props.running.length} 运行中</span>
        </Show>
      </button>

      <Show when={open() && trigger()}>
        {(element) => (
          <TasksPopover
            trigger={element()}
            tasks={props.tasks}
            running={props.running}
            dark={props.dark}
            onOpenTask={(id) => {
              setOpen(false)
              props.onOpenTask(id)
            }}
            onCreate={() => {
              setOpen(false)
              props.onCreate()
            }}
            onManage={() => {
              setOpen(false)
              props.onManage()
            }}
            onClose={close}
          />
        )}
      </Show>
    </>
  )
}
