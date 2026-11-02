export const card = "border:1px solid rgba(127,127,127,0.2);border-radius:12px;background:rgba(127,127,127,0.03);"

export const button =
  "height:30px;box-sizing:border-box;padding:0 12px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;"

export const primaryButton =
  "height:30px;box-sizing:border-box;padding:0 14px;border-radius:7px;border:1px solid transparent;background:var(--v2-accent,#22c55e);color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;"

export const dangerButton =
  "height:30px;box-sizing:border-box;padding:0 12px;border-radius:7px;border:1px solid rgba(239,68,68,0.45);background:transparent;color:#ef4444;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;"

export const input =
  "width:100%;box-sizing:border-box;padding:7px 9px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;font-family:inherit;"

export const select =
  "height:30px;box-sizing:border-box;padding:0 8px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;"

export const label = "font-size:11px;opacity:0.65;"

export const muted = "font-size:11px;opacity:0.55;"

export const rowTitle = "font-size:13px;font-weight:600;"

export const mono = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;"

export function dot(color: string): string {
  return `width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;`
}
