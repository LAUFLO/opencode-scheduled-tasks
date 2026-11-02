import { Show, createSignal } from "solid-js"
import { Portal } from "solid-js/web"
import { Command, MenuItem, Panel, Plugin, SettingsPage, Slot } from "@opencode/plugin/gui"
import type { PanelTab } from "@opencode/plugin/gui"
import { ScheduledTasks, type ModelRef, type TaskView } from "./rpc.ts"
import type { ModelOption, ProjectOption, Snapshot, TaskDraft } from "./gui/types.ts"
import { TaskEditor } from "./gui/editor.tsx"
import { TasksPanel } from "./gui/panel.tsx"
import { TasksSettings } from "./gui/settings.tsx"
import { TasksBadge } from "./gui/badge.tsx"

const PANEL_ID = "scheduled-tasks"
const PANEL_KEY = "opencode-scheduled-tasks:scheduled-tasks"
const PAGE_ID = "scheduled-tasks"
const POLL = 10_000

type RunStatus = "running" | "success" | "error"

export default Plugin.define({
  setup(ctx) {
    const api = ctx.client.rpc(ScheduledTasks)
    const [tasks, setTasks] = createSignal<TaskView[]>([])
    const [running, setRunning] = createSignal<string[]>([])
    const [loading, setLoading] = createSignal(false)
    const [error, setError] = createSignal<string | undefined>()
    const [selectedID, setSelectedID] = createSignal<string | undefined>()
    const [projects, setProjects] = createSignal<ProjectOption[]>([])
    const [models, setModels] = createSignal<ModelOption[]>([])
    const [editorDraft, setEditorDraft] = createSignal<TaskDraft | undefined>()

    let disposed = false
    let loadingTasks = false
    let seenRuns = new Map<string, { at: number; status: RunStatus }>()
    let primed = false

    const currentDirectory = () => {
      const session = ctx.sessions.current()
      const location = session?.location as { directory?: string } | undefined
      return location?.directory
    }

    const loadTasks = async (silent = false) => {
      if (loadingTasks || disposed) return
      loadingTasks = true
      if (!silent) setLoading(true)
      try {
        const result = (await api.snapshot({})) as Snapshot
        if (disposed) return
        setTasks(result.tasks)
        setRunning(result.running)
        setError(undefined)

        const current = selectedID()
        if (result.tasks.length > 0 && (!current || !result.tasks.some((task) => task.id === current))) {
          setSelectedID(result.tasks[0].id)
        }

        const nextSeen = new Map<string, { at: number; status: RunStatus }>()
        for (const task of result.tasks) {
          const run = task.runs[0]
          if (!run) continue
          nextSeen.set(task.id, { at: run.at, status: run.status })
          const previous = seenRuns.get(task.id)
          const finished = run.status !== "running"
          const changed = !previous || previous.at !== run.at || previous.status !== run.status
          if (primed && finished && changed) {
            void ctx.attention.notify({
              title: run.status === "success" ? `定时任务完成：${task.name}` : `定时任务失败：${task.name}`,
              message: run.error ?? `耗时 ${Math.round((run.durationMs ?? 0) / 1000)} 秒`,
              variant: run.status === "success" ? "default" : "error",
            })
          }
        }
        seenRuns = nextSeen
        primed = true
      } catch (cause) {
        if (!disposed) setError(`无法读取定时任务：${String(cause)}`)
      } finally {
        loadingTasks = false
        if (!disposed) setLoading(false)
      }
    }

    const loadProjects = async () => {
      try {
        const result = (await ctx.client.project.list()) as unknown as unknown[] | { data?: unknown[] }
        const list = Array.isArray(result)
          ? result
          : Array.isArray((result as { data?: unknown }).data)
            ? (result as { data: unknown[] }).data
            : []
        if (disposed) return
        setProjects(
          list
            .map((item) => {
              const project = item as { id?: string; name?: string; canonical?: string; worktree?: string }
              const canonical = typeof project.canonical === "string" ? project.canonical : project.worktree ?? ""
              const folder = canonical.split(/[\\/]/).filter(Boolean).pop()
              return {
                id: String(project.id ?? ""),
                name: project.name ?? folder ?? canonical,
                directory: canonical,
              }
            })
            .filter((project) => project.directory.length > 0),
        )
      } catch {
        if (!disposed) setProjects([])
      }
    }

    const loadModels = async () => {
      try {
        const result = (await ctx.client.model.list()) as unknown as unknown[] | { data?: unknown[] }
        const list = Array.isArray(result)
          ? result
          : Array.isArray((result as { data?: unknown }).data)
            ? (result as { data: unknown[] }).data
            : []
        if (disposed) return
        const options: ModelOption[] = []
        for (const item of list) {
          const model = item as { id?: string; providerID?: string; name?: string; provider?: { id?: string } }
          const providerID = model.providerID ?? model.provider?.id
          const id = model.id
          if (!providerID || !id) continue
          options.push({
            key: `${providerID}/${id}`,
            label: `${providerID} / ${model.name ?? id}`,
            ref: { providerID, id },
          })
        }
        setModels(options)
      } catch {
        if (!disposed) setModels([])
      }
    }

    const saveTask = async (draft: TaskDraft): Promise<string | undefined> => {
      try {
        const result = (await api.save({
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          prompt: draft.prompt,
          directory: draft.directory,
          schedule: draft.schedule,
          enabled: draft.enabled,
          mode: draft.mode,
          ...(draft.model ? { model: draft.model } : {}),
        })) as { ok: boolean; id?: string; error?: string }
        if (!result.ok) return result.error ?? "保存失败"
        await loadTasks(true)
        if (result.id) setSelectedID(result.id)
        ctx.toast.show({ title: draft.id ? "已保存定时任务" : "已创建定时任务" })
        return undefined
      } catch (cause) {
        return String(cause)
      }
    }

    const openEditor = (task?: TaskView) => {
      const directory = task?.directory ?? currentDirectory() ?? projects()[0]?.directory ?? ""
      const draft: TaskDraft = task
        ? {
            id: task.id,
            name: task.name,
            prompt: task.prompt,
            directory: task.directory,
            schedule: task.schedule,
            enabled: task.enabled,
            mode: task.mode,
            ...(task.model ? { model: task.model } : {}),
          }
        : {
            name: "",
            prompt: "",
            directory,
            schedule: { kind: "daily", time: "09:00" },
            enabled: true,
            mode: "plan",
          }

      setEditorDraft(draft)
      const session = ctx.sessions.current()
      if (session) ctx.layout.open(PANEL_KEY, session)
      else ctx.layout.settings(PAGE_ID)
    }

    const deleteTask = async (id: string) => {
      const task = tasks().find((item) => item.id === id)
      const confirmed = await ctx.dialogs.confirm({
        title: `删除定时任务「${task?.name ?? id}」？`,
        description: "任务和它的运行历史会一起删除，无法恢复。",
        confirm: "删除",
        danger: true,
      })
      if (!confirmed) return
      const result = (await api.remove({ id })) as { ok: boolean; error?: string }
      if (!result.ok) {
        ctx.toast.show({ title: "删除失败", description: result.error, variant: "error" })
        return
      }
      if (selectedID() === id) setSelectedID(undefined)
      await loadTasks(true)
    }

    const runNow = async (id: string) => {
      const result = (await api.runNow({ id })) as { ok: boolean; error?: string }
      if (!result.ok) {
        ctx.toast.show({ title: "无法运行", description: result.error, variant: "error" })
        return
      }
      ctx.toast.show({ title: "已开始运行" })
      await loadTasks(true)
    }

    const toggleTask = async (id: string) => {
      const task = tasks().find((item) => item.id === id)
      if (!task) return
      const result = (await api.toggle({ id, enabled: !task.enabled })) as { ok: boolean; error?: string }
      if (!result.ok) {
        ctx.toast.show({ title: "操作失败", description: result.error, variant: "error" })
        return
      }
      await loadTasks(true)
    }

    const openSession = (sessionID: string) => {
      const session = ctx.sessions.current()
      const server = session?.server.id ?? ctx.servers.list()[0]
      if (!server) {
        ctx.toast.show({ title: "找不到本地服务器", variant: "error" })
        return
      }
      ctx.tabs.open({ server, id: sessionID }, { focus: true })
    }

    const openPanel = () => {
      const session = ctx.sessions.current()
      if (!session) {
        ctx.toast.show({ title: "先打开一个会话", description: "定时任务面板显示在会话右侧" })
        return
      }
      ctx.layout.open(PANEL_KEY, session)
    }

    const editor = () => (
      <Show when={editorDraft()}>
        {(draft) => (
          <Portal>
            <TaskEditor
              draft={draft()}
              projects={projects()}
              models={models()}
              dark={ctx.appearance.mode() === "dark"}
              ui={ctx.ui}
              onCancel={() => setEditorDraft(undefined)}
              onSave={async (value) => {
                const failure = await saveTask(value)
                if (!failure) setEditorDraft(undefined)
                return failure
              }}
            />
          </Portal>
        )}
      </Show>
    )

    const openSettings = () => ctx.layout.settings(PAGE_ID)

    const createFromPalette = () => {
      void loadProjects()
      openEditor()
    }

    void loadTasks(true)
    void loadProjects()
    void loadModels()

    const timer = setInterval(() => void loadTasks(true), POLL)
    const unsubscribe = api.events.on("changed", () => void loadTasks(true))

    const panelTab: PanelTab = {
      id: PANEL_ID,
      title: "定时任务",
      label: () => "定时任务",
    }

    ctx.add(Panel, {
      id: PANEL_ID,
      region: "side",
      wide: true,
      mobile: {
        title: "定时任务",
        order: 45,
        kind: "tab",
        icon: "outline-rotate-clockwise",
      },
      list: (input) => (input.open.includes(PANEL_ID) ? [panelTab] : []),
      render: () => (
        <>
          <TasksPanel
            tasks={tasks()}
            running={running()}
            selectedID={selectedID()}
            loading={loading()}
            error={error()}
            onSelect={setSelectedID}
            onCreate={() => openEditor()}
            onEdit={(id) => openEditor(tasks().find((task) => task.id === id))}
            onDelete={(id) => void deleteTask(id)}
            onRunNow={(id) => void runNow(id)}
            onToggle={(id) => void toggleTask(id)}
            onOpenSession={openSession}
            onRefresh={() => void loadTasks()}
            ui={ctx.ui}
          />
          {editor()}
        </>
      ),
    })

    ctx.add(SettingsPage, {
      id: PAGE_ID,
      icon: "outline-rotate-clockwise",
      get title() {
        return "定时任务"
      },
      get entries() {
        return [
          { id: "tasks", title: "定时任务", keywords: "schedule cron task 定时 任务 自动化" },
          { id: "create", title: "新建定时任务", keywords: "new create schedule 新建 定时" },
        ]
      },
      render: () => (
        <>
          <TasksSettings
            tasks={tasks()}
            running={running()}
            selectedID={selectedID()}
            loading={loading()}
            error={error()}
            onSelect={setSelectedID}
            onCreate={() => openEditor()}
            onEdit={(id) => openEditor(tasks().find((task) => task.id === id))}
            onDelete={(id) => void deleteTask(id)}
            onRunNow={(id) => void runNow(id)}
            onToggle={(id) => void toggleTask(id)}
            onOpenSession={openSession}
            onRefresh={() => void loadTasks()}
            ui={ctx.ui}
          />
          {editor()}
        </>
      ),
    })

    ctx.add(Slot, {
      at: "session.header",
      order: 45,
      render: () => <TasksBadge tasks={tasks()} running={running()} onOpen={openPanel} />,
    })

    ctx.add(MenuItem, {
      menu: "session.panel",
      id: PANEL_ID,
      title: "定时任务",
      icon: "outline-rotate-clockwise",
      run: openPanel,
    })

    ctx.add(Command, () => ({
      id: "open",
      title: "打开定时任务",
      keywords: "schedule cron task 定时 任务",
      group: "定时任务",
      run: openPanel,
    }))

    ctx.add(Command, () => ({
      id: "create",
      title: "新建定时任务",
      keywords: "new create schedule cron 新建 定时",
      group: "定时任务",
      run: createFromPalette,
    }))

    ctx.add(Command, () => ({
      id: "settings",
      title: "管理定时任务",
      keywords: "settings manage schedule cron 管理 定时",
      group: "定时任务",
      run: openSettings,
    }))

    return () => {
      disposed = true
      clearInterval(timer)
      unsubscribe()
    }
  },
})
