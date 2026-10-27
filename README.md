# spec-cycle-lens

A read-only Claude Code mod that watches a [spec-cycle](https://github.com/u-nae/spec-cycle) project.

- **Band** above the prompt: the active work item, its gate stage (`대기`, `REVISE r1/2`, `질문 1개`, `READY`,
  `구현 중 · cov 3/8`, …), the revision, a done meter, and `⚠ 스냅숏 오래됨` when a baseline changed after the snapshot.
  Pressing it opens the pane.
- **`/lens` pane**: *Items* (one card per work item, Enter opens its run, `p` pins it), *Run* (critic passes,
  findings, unanswered questions with the recommended option and its rationale, handoff errors, coverage) and
  *Docs* (the run's brief, handoff, specs, critic reports, decision log and verification; Enter reads one in the
  pane as Markdown or code, `b` goes back, `c` copies the path or `o` opens an editor when enabled).
  `/lens pin W05`, `/lens unpin`, `/lens refresh`.
- **Toasts**: a verdict change is announced once (`W05 READY · /spec-cycle:implement W05`, `W05 질문 1개 · 권장안 A`,
  `W05 revision 한도 도달`, `W05 완료 · 다음 W06`). The first read of a session only sets the baseline.
- **Suggestion**: the next spec-cycle command (`/spec-cycle:run W05`, `implement`, `verify`) shown dim in the empty
  prompt box, Tab to take, once per change; while you type, the same command rides on the hint line.

It never submits a prompt, never changes a work item's status and never writes a spec-cycle file. The one source
of truth is `.spec-cycle/status.json`, which spec-cycle 0.4.0 writes after every state-changing subcommand
(`status --json --write` on demand). Without that file the mod draws nothing. By default the mod runs no
process on the host; the two settings that do (`openInEditor`, `specCycleScript`) are off and empty.

Checked against Claude Code 2.1.311 (mod API, early access). Needs spec-cycle 0.4.0 or later.

## Install

At the prompt of a terminal session (`y` to add the marketplace, then a scope):

```text
/plugin install spec-cycle-lens --marketplace u-nae/spec-cycle-lens
```

From a shell: `claude plugin install spec-cycle-lens --marketplace u-nae/spec-cycle-lens`. In the desktop app: + next to
the prompt box, Plugins, Add marketplace with `u-nae/spec-cycle-lens`, then Add plugin.

While developing, run it from the folder instead: `claude --plugin-dir /path/to/spec-cycle-lens`.

## Settings (`/config`)

| Key | Values | Default |
| --- | --- | --- |
| `band` | `on`, `off` | `on` |
| `suggest` | `on`, `off` | `on` |
| `icons` | `unicode`, `nerd`, `emoji` | `unicode` |
| `snapshotPath` | path relative to the project | `.spec-cycle/status.json` |
| `toasts` | `on`, `off` | `on` |
| `openInEditor` | `off` (copy the path), `auto` (windowed `$VISUAL`/`$EDITOR`, then `code`/`cursor` by `TERM_PROGRAM`, then `open`), `tmux-nvim` | `off` |
| `specCycleScript` | absolute path of `spec-cycle.mjs`; `/lens refresh` then runs `node <script> status --json --write` | empty |

## Check it

```sh
claude plugin validate . --strict   # gatingHooks is empty; process.run and env.get appear only behind openInEditor/specCycleScript
claude plugin test .                # one test file per module
tsc -p .                            # types are laid under .claude-plugin/types/ once a session has loaded the mod
```

## Layout

```text
hooks/register.tsx   wiring: events, timers, the /lens command
hooks/host.ts        the $ calls (fs port, pin store)
hooks/snapshot.ts    reading status.json: parse, mtime:size cache, staleness
hooks/active.ts      pickActive (PRD 6.1)
hooks/next-command.ts nextCommand table (PRD 6.2)
hooks/band.tsx       band model and width layout
hooks/pane.tsx       Items, Run and Docs tabs
hooks/transitions.ts verdict changes → toasts (PRD 6.7)
hooks/editor.ts      editor candidates (PRD 6.8)
hooks/icons.ts, hooks/text.ts
docs/decisions/      0001-0006, the choices fixed in the PRD
```

The plan is `spec-cycle/docs/superpowers/specs/2026-10-27-spec-cycle-lens-prd.md` in the spec-cycle repository.
Stages 2 and 3 are in: acceptance A11-A20, the Docs tab, toasts, the editor and `/lens refresh` with the script.
Stage 4 (an edit guard, `tmux-nvim` beyond the candidate list, prismantis) waits for a decision record.

## License

MIT
