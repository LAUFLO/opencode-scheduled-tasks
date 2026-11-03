import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { Portal } from "solid-js/web"
import type { TaskView } from "../rpc.ts"
import { describeSchedule, formatCountdown, formatWhen } from "../shared/schedule.ts"
import { dot, muted } from "./theme"
import { statusColor, statusText } from "./task-view.tsx"

const WIDTH = 320
const MAX_HEIGHT = 360

const item =
  "display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-family:inherit;"

const action =
  "height:26px;padding:0 8px;border-radius:6px;border:0;background:transparent;color:inherit;font-size:11px;font-family:inherit;cursor:pointer;opacity:0.75;"

export function TasksPopover(props: {
  trigger: HTMLElement
  tasks: TaskView[]
  running: string[]
  dark: boolean
  onOpenTask: (id: string) => void
  onCreate: () => void
  onManage: () => void
  onClose: () => void
}) {
  const [pos, setPos] = createSignal<{ top?: number; bottom?: number; left: number; maxHeight: number }>({
    top: 0,
    left: 0,
    maxHeight: MAX_HEIGHT,
  })
  let root: HTMLDivElement | undefined

  const surface = () => (props.dark ? "#1f1f1f" : "#ffffff")
  const border = () => (props.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)")
  const shade = () => (props.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)")

  const place = () => {
    const box = props.trigger.getBoundingClientRect()
    const width = Math.min(WIDTH, window.innerWidth - 16)
    const left = Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8))
    const below = window.innerHeight - box.bottom - 12
    const above = box.top - 12
    const maxHeight = Math.max(200, Math.min(MAX_HEIGHT, Math.max(below, above)))
    if (below >= 240 || below >= above) setPos({ top: box.bottom + 6, left, maxHeight })
    else setPos({ bottom: window.innerHeight - box.top + 6, left, maxHeight })
  }

  const isRunning = (task: TaskView) => props.running.includes(task.id)

  const subtitle = (task: TaskView) => {
    if (isRunning(task)) return "正在运行…"
    if (!task.enabled) return describeSchedule(task.schedule)
    if (!task.nextRun) return describeSchedule(task.schedule)
    const countdown = formatCountdown(task.nextRun)
    const suffix = countdown === "即将运行" ? "" : ` · ${countdown}后`
    return `下次 ${formatWhen(task.nextRun)}${suffix}`
  }

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node
    if (root?.contains(target) || props.trigger.contains(target)) return
    props.onClose()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    props.onClose()
  }

  onMount(() => {
    place()
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    root?.querySelector<HTMLElement>("button")?.focus()
  })

  onCleanup(() => {
    document.removeEventListener("pointerdown", onPointerDown, true)
    document.removeEventListener("keydown", onKeyDown, true)
    window.removeEventListener("resize", place)
    window.removeEventListener("scroll", place, true)
  })

  return (
    <Portal>
      <div
        ref={root}
        role="dialog"
        aria-label="定时任务"
        style={`position:fixed;z-index:9999;box-sizing:border-box;display:flex;flex-direction:column;width:${WIDTH}px;max-width:calc(100vw - 16px);left:${pos().left}px;${
          pos().top !== undefined ? `top:${pos().top}px;` : `bottom:${pos().bottom}px;`
        }max-height:${pos().maxHeight}px;border-radius:12px;border:1px solid ${border()};background:${surface()};color:inherit;font-size:12px;box-shadow:0 12px 32px rgba(0,0,0,0.22);overflow:hidden;`}
      >
        <div
          style={`display:flex;align-items:center;justify-content:space-between;flex-shrink:0;padding:9px 12px;border-bottom:1px solid ${border()};background:${shade()};`}
        >
          <span style="font-size:12px;font-weight:600;">定时任务</span>
          <span style={muted}>{props.tasks.length} 个</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:1px;padding:4px;min-height:0;overflow-y:auto;">
          <Show
            when={props.tasks.length > 0}
            fallback={
              <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 12px;text-align:center;">
                <span style={muted}>还没有定时任务</span>
                <button type="button" onClick={props.onCreate} style={action}>
                  新建一个
                </button>
              </div>
            }
          >
            <For each={props.tasks}>
              {(task) => (
                <button type="button" onClick={() => props.onOpenTask(task.id)} style={item}>
                  <span style={`${dot(statusColor(task, isRunning(task)))}margin-top:4px;`} />
                  <span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
                    <span style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      {task.name}
                    </span>
                    <span style={`${muted}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`}>
                      {subtitle(task)}
                    </span>
                  </span>
                  <span style={`${muted}margin-top:1px;flex-shrink:0;white-space:nowrap;`}>
                    {statusText(task, isRunning(task))}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>

        <div
          style={`display:flex;align-items:center;justify-content:space-between;flex-shrink:0;padding:5px 6px;border-top:1px solid ${border()};background:${shade()};`}
        >
          <button type="button" onClick={props.onCreate} style={action}>
            ＋ 新建任务
          </button>
          <button type="button" onClick={props.onManage} style={action}>
            管理全部 ›
          </button>
        </div>
      </div>
    </Portal>
  )
}
