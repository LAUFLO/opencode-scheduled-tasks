# OpenCode Scheduled Tasks

Scheduled tasks for [OpenCode](https://opencode.ai) Desktop: write a prompt once, let the agent run it on a schedule, and read the result in its own session.

Inspired by the scheduled-tasks page in Codex Desktop, rebuilt as an OpenCode Desktop plugin.

## Features

- **Scheduled prompts** — daily, weekly, every N minutes, or one time only.
- **Right-side panel** — a `定时任务` tab in the session's side region, with a list and a detail view.
- **Settings page** — a full two-column manager under Settings, for creating, editing and reviewing tasks.
- **Session header badge** — shows the next run countdown, or how many tasks are running.
- **Independent sessions** — every run creates a new session titled `[定时] <task name>`, so results never mix.
- **Model and mode per task** — pick a model, or use the default; run in read-only `plan` mode or the default agent.
- **Run history** — the last 20 runs with status, duration and a link to the session.
- **Notifications** — an app notice and a system notification when a run finishes (only while the app is open).
- **Command palette** — open the panel, create a task, or jump to the settings page.
- **Local only** — tasks and history stay in the app's local storage; no secrets are written to disk.
- **Agent tools** — ask the agent in any session to create, list, run or delete scheduled tasks in natural language.

## Important limits

- **The app must be running.** The scheduler lives in the OpenCode server process. If OpenCode Desktop is closed, tasks do not run. Missed runs are skipped, not replayed; the next run is computed from the current time when the app starts again.
- **The panel needs a session.** Open any session, then open the `定时任务` tab from the `+` menu or the command palette.
- **Permissions still apply.** In `plan` mode the agent cannot modify files, which is the safe default for unattended runs. In default mode a run can stop on a permission prompt and wait for you.
- **Model availability matters.** If the selected model is not available for your account, the run fails and the error is recorded. Pick a model that works in a normal chat first.

## Requirements

- OpenCode Desktop **2.2.5 or newer** (V2 GUI plugin API).
- Node.js 20+ and npm, only to install the plugin's server dependency.

## Install

Clone the repository into your global OpenCode plugins directory.

**macOS / Linux**

```bash
git clone https://github.com/LAUFLO/opencode-scheduled-tasks.git \
  ~/.config/opencode/plugins/opencode-scheduled-tasks
cd ~/.config/opencode/plugins/opencode-scheduled-tasks
npm install --omit=dev
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/LAUFLO/opencode-scheduled-tasks.git `
  "$env:USERPROFILE\.config\opencode\plugins\opencode-scheduled-tasks"
cd "$env:USERPROFILE\.config\opencode\plugins\opencode-scheduled-tasks"
npm install --omit=dev
```

Then add the plugin to your global `opencode.jsonc`:

```jsonc
{
  "plugins": [
    "./plugins/opencode-scheduled-tasks"
  ]
}
```

Restart OpenCode Desktop, then open **Settings → 定时任务**.

The prebuilt `gui-experimental.cjs` is committed, so a rebuild is not needed after `git pull`.

## Create from chat

The plugin registers four tools the agent can call in any session:

| Tool | What it does |
|---|---|
| `scheduled_task_create` | Creates a task from a name, prompt and schedule |
| `scheduled_task_list` | Lists tasks with their next run |
| `scheduled_task_delete` | Deletes a task by id or name |
| `scheduled_task_run` | Runs a task immediately |

Ask in natural language, for example:

> 每天上午 9 点检查这个项目的 git 状态，有未提交的文件就列出来

The agent fills the project directory from the current session, so you do not need to repeat the path. It defaults to read-only `plan` mode; mention "可以改文件" if the task needs to write.

## Usage

1. Open **Settings → 定时任务**, or run `新建定时任务` from the command palette.
2. Fill in:
   - **名称** — how the task lists.
   - **说明** — the prompt sent to the agent.
   - **重复** — daily, weekly, every N minutes, or once.
   - **项目** — which project's directory the session belongs to.
   - **模型** — the default model, or a specific one.
   - **运行模式** — `只读（plan）` or `默认`.
3. Save, then use **立即运行** to test it without waiting for the schedule.
4. Open the right-side panel from the `+` menu to watch upcoming runs.

## Data

Tasks and run history are stored in `~/.config/opencode/scheduled-tasks/tasks.json` and are shared across every project. Deleting a task removes its history. Sessions created by runs are normal sessions and can be deleted like any other.

The file is written atomically (temporary file + rename). If several projects are open at once, only one of them runs a due task; the others skip it.

## Safety

- The plugin never reads or writes provider credentials.
- The scheduler runs on your machine and uses your existing OpenCode configuration.
- `plan` mode is the default because unattended runs should not modify files without supervision.

## Development

```bash
npm install
npm run build      # writes gui-experimental.cjs
```

- `index.ts` — server entry: storage, scheduler, run execution, RPC.
- `src/rpc.ts` — RPC contract.
- `src/gui.tsx` — GUI entry: panel, settings page, badge, commands.
- `src/gui/` — editor, list, detail, panel, settings and theme.
- `src/shared/schedule.ts` — next-run calculation and formatting, shared by both sides.

## License

MIT
