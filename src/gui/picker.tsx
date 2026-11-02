import { For, Show, createSignal, onCleanup, onMount } from "solid-js"

export type PickerOption = {
  value: string
  label: string
}

/**
 * A dropdown that follows the app's theme instead of the operating system's native list.
 * Native `<select>` popups cannot be styled and show the OS highlight color.
 * The list is fixed-positioned so a scrolling dialog never clips it.
 */
export function Picker(props: {
  value: string
  options: PickerOption[]
  placeholder?: string
  dark: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const [hover, setHover] = createSignal(-1)
  const [rect, setRect] = createSignal<{ top: number; left: number; width: number; maxHeight: number }>()
  let root: HTMLDivElement | undefined

  const surface = () => (props.dark ? "#1f1f1f" : "#ffffff")
  const border = () => (props.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)")
  const current = () => props.options.find((option) => option.value === props.value)?.label ?? props.placeholder ?? ""

  const close = () => {
    setOpen(false)
    setHover(-1)
  }

  const openMenu = () => {
    const trigger = root?.firstElementChild as HTMLElement | undefined
    if (!trigger) return
    const box = trigger.getBoundingClientRect()
    const below = window.innerHeight - box.bottom - 12
    const above = box.top - 12
    const maxHeight = Math.max(160, Math.min(280, Math.max(below, above)))
    const top = below >= 180 || below >= above ? box.bottom + 4 : Math.max(8, box.top - maxHeight - 4)
    setRect({ top, left: box.left, width: box.width, maxHeight })
    setOpen(true)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!root) return
    if (root.contains(event.target as Node)) return
    close()
  }
  const onDismiss = () => close()

  onMount(() => {
    document.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("resize", onDismiss)
    window.addEventListener("scroll", onDismiss, true)
  })
  onCleanup(() => {
    document.removeEventListener("pointerdown", onPointerDown, true)
    window.removeEventListener("resize", onDismiss)
    window.removeEventListener("scroll", onDismiss, true)
  })

  return (
    <div ref={root} style="position:relative;width:100%;min-width:0;">
      <button
        type="button"
        onClick={() => (open() ? close() : openMenu())}
        style="width:100%;height:32px;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:0 10px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;font-family:inherit;cursor:pointer;text-align:left;"
      >
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          {current()}
        </span>
        <span style="flex-shrink:0;font-size:9px;opacity:0.55;">▾</span>
      </button>

      <Show when={open() && rect()}>
        {(bounds) => (
          <div
            style={`position:fixed;top:${bounds().top}px;left:${bounds().left}px;width:${bounds().width}px;max-height:${bounds().maxHeight}px;overflow-y:auto;z-index:1200;padding:4px;border-radius:9px;border:1px solid ${border()};background:${surface()};box-shadow:0 12px 32px rgba(0,0,0,0.24);`}
          >
            <For each={props.options}>
              {(option, index) => (
                <button
                  type="button"
                  onMouseEnter={() => setHover(index())}
                  onMouseLeave={() => setHover(-1)}
                  onClick={() => {
                    props.onChange(option.value)
                    close()
                  }}
                  style={`display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:7px 8px;border:none;border-radius:6px;background:${
                    option.value === props.value
                      ? "rgba(127,127,127,0.18)"
                      : hover() === index()
                        ? "rgba(127,127,127,0.1)"
                        : "transparent"
                  };color:inherit;font-size:12px;font-family:inherit;text-align:left;cursor:pointer;`}
                >
                  <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    {option.label}
                  </span>
                  <Show when={option.value === props.value}>
                    <span style="flex-shrink:0;font-size:11px;opacity:0.7;">✓</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  )
}
