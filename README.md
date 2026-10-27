# spec-cycle-lens

A read-only Claude Code mod that watches a [spec-cycle](https://github.com/u-nae/spec-cycle) project.
It draws one line above the prompt (active work item, gate verdict, revision, coverage), opens a
`/lens` pane to browse work items and runs, and proposes the next spec-cycle command in the prompt box.
It never submits a prompt, never changes a work item's status and never writes a spec-cycle file.

Status: stage 0 spike (fixed text). Checked against Claude Code 2.1.311 (mod API, early access).

## Run it from the folder

```sh
claude --plugin-dir /path/to/spec-cycle-lens
```

Then `/lens` opens the pane; the band shows above the prompt; Tab takes the suggested command.

## Check it

```sh
claude plugin validate . --strict
claude plugin test .
tsc -p .
```

## Plan

See `spec-cycle/docs/superpowers/specs/2026-10-27-spec-cycle-lens-prd.md` in the spec-cycle repository.
Stage 1 adds `status --json --write` to spec-cycle 0.4.0; stage 2 reads that snapshot here.

## License

MIT
