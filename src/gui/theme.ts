export const card = "border:1px solid rgba(127,127,127,0.2);border-radius:12px;background:rgba(127,127,127,0.03);"

export const field = "height:32px;box-sizing:border-box;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;font-family:inherit;"

export const input = `${field}width:100%;padding:0 9px;`

export const textarea =
  "width:100%;box-sizing:border-box;padding:8px 9px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;font-family:inherit;line-height:1.5;resize:vertical;"

export const label = "font-size:11px;opacity:0.65;"

export const muted = "font-size:11px;opacity:0.55;"

export const rowTitle = "font-size:13px;font-weight:600;"

export const mono = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;"

export function dot(color: string): string {
  return `width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;`
}
