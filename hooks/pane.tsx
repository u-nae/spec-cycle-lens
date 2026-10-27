import { iconSet, statusGlyph } from './icons'
import { nextCommand } from './next-command'
import type { Item, LensRead, RunInfo } from './snapshot'
import { truncate } from './text'

export type Tab = 'items' | 'run' | 'docs'

export type DocView = { path: string; text: string | null; error: string | null }

export type PaneModel = {
  read: LensRead
  tab: Tab
  selected: Item | null
  pinned: string | null
  icons: string | undefined
  bodyColumns: number
  doc: DocView | null
  canOpenInEditor: boolean
  cwd: string
}

export type PaneActions = {
  showTab: (tab: Tab) => void
  select: (id: string) => void
  togglePin: (id: string) => void
  openDoc: (path: string) => void
  closeDoc: () => void
  openInEditor: (path: string) => void
  copyPath: (path: string) => void
}

type Elements = { Box: any; Text: any; Button: any; Markdown: any; Code: any; Link: any }

function stageOf(item: Item): string {
  const next = nextCommand({ hasConfig: true, hasFile: true, snapshot: { items: [item] } as never, active: item })
  return next.label ?? ''
}

function relative(iso: string | null | undefined, now: number): string {
  if (!iso) return ''
  const ms = now - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return ''
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}시간 전`
  return `${Math.round(hours / 24)}일 전`
}

function itemCard(el: Elements, model: PaneModel, item: Item, actions: PaneActions, now: number) {
  const { Box, Text, Button } = el
  const set = iconSet(model.icons)
  const narrow = model.bodyColumns < 44
  const compact = model.bodyColumns < 64
  const details = [
    item.run?.verdict ?? (item.run ? '비평 전' : 'run 없음'),
    item.run && item.run.revision_count !== null ? `r${item.run.revision_count}/${item.run.max_revisions ?? '?'}` : null,
    item.verification ? `cov ${item.verification.covered}/${item.verification.total}` : null,
    item.dependencies_done ? null : `의존성 대기: ${item.dependencies.join(', ')}`,
    item.run ? relative(item.run.updated_at, now) : null,
  ].filter(Boolean).join(' · ')
  const isSelected = model.selected?.id === item.id
  const titleRoom = Math.max(8, model.bodyColumns - (narrow ? 2 : 4) - item.id.length - stageOf(item).length - 6)
  const head = (
    <Button key={`item:${item.id}`} plain onPress={() => actions.select(item.id)}>
      <Text color={isSelected ? 'cyan' : undefined}>{statusGlyph(set, item.status)}</Text>{' '}
      <Text bold>{model.pinned === item.id ? `📌${item.id}` : item.id}</Text>{' '}
      <Text>{truncate(item.title, titleRoom)}</Text>{' '}
      <Text inverse>{` ${stageOf(item)} `}</Text>
      {compact ? null : <Text dimColor>{`  ${details}`}</Text>}
    </Button>
  )
  return (
    <Box key={`card:${item.id}`} flexDirection="column" borderStyle={narrow ? undefined : 'round'} borderDimColor paddingX={narrow ? 0 : 1}>
      {head}
      {compact && details ? <Text dimColor>{`  ${details}`}</Text> : null}
    </Box>
  )
}

function itemsTab(el: Elements, model: PaneModel, actions: PaneActions, now: number) {
  const { Box, Text, Button } = el
  const items = model.read.snapshot?.items ?? []
  if (items.length === 0) return <Text dimColor>작업 항목이 없습니다. /spec-cycle:work-items 로 만드세요.</Text>
  return (
    <Box flexDirection="column">
      {items.map(item => itemCard(el, model, item, actions, now))}
      {model.selected ? (
        <Button key="pin" hotkey="p" plain onPress={() => actions.togglePin(model.selected!.id)}>
          {model.pinned === model.selected.id ? `unpin ${model.selected.id}` : `pin ${model.selected.id}`}
        </Button>
      ) : null}
    </Box>
  )
}

function runTab(el: Elements, model: PaneModel) {
  const { Box, Text } = el
  const item = model.selected
  if (!item) return <Text dimColor>항목을 고르세요 (Items 탭).</Text>
  const run = item.run
  const rows: any[] = [
    <Text key="h" bold>{`${item.id} ${item.title}`}</Text>,
    <Text key="s" dimColor>{`status ${item.status}${item.priority ? ` · ${item.priority}` : ''}${item.dependencies.length ? ` · deps ${item.dependencies.join(', ')}` : ''}`}</Text>,
  ]
  if (!run) {
    rows.push(<Text key="nr" dimColor>run 없음 · /spec-cycle:run {item.id}</Text>)
  } else {
    rows.push(<Text key="r">{`run ${run.id} · ${run.route ?? '-'} · r${run.revision_count ?? '?'}/${run.max_revisions ?? '?'} · pass ${run.critic_passes} · ${run.verdict ?? '비평 전'}`}</Text>)
    if (run.findings) {
      const f = run.findings
      rows.push(<Text key="f" dimColor>{`findings critical ${f.critical} · major ${f.major} · minor ${f.minor} · note ${f.note}`}</Text>)
    }
    for (const question of run.open_questions) {
      rows.push(
        <Box key={`q:${question.question_id}`} flexDirection="column" paddingLeft={1}>
          <Text color="yellow">{`? ${question.question_id}${question.blocking ? ' (blocking)' : ''}: ${question.question ?? ''}`}</Text>
          <Text>{`  권장 ${question.recommended_default ?? '-'}${question.recommended_label ? ` ${question.recommended_label}` : ''}`}</Text>
          {question.recommendation_rationale ? <Text dimColor>{`  ${truncate(question.recommendation_rationale, Math.max(20, model.bodyColumns - 4))}`}</Text> : null}
        </Box>,
      )
    }
    if (item.handoff) {
      rows.push(<Text key="ho" color={item.handoff.usable ? 'green' : 'yellow'}>{`handoff ${item.handoff.usable ? 'usable' : 'unusable'} · obligations ${item.handoff.obligations_total}`}</Text>)
      for (const error of item.handoff.errors) rows.push(<Text key={`he:${error}`} color="yellow">{`  ✗ ${error}`}</Text>)
      for (const warning of item.handoff.warnings) rows.push(<Text key={`hw:${warning}`} dimColor>{`  ! ${warning}`}</Text>)
    }
    if (item.verification) {
      const v = item.verification
      rows.push(<Text key="v">{`verify cov ${v.covered}/${v.total} · tests ${v.tests}${v.status_written ? ` · ${v.status_written}` : ''}`}</Text>)
    }
    if (run.artifacts.decision_log) rows.push(<Text key="dl" dimColor>{`decision log ${run.artifacts.decision_log}`}</Text>)
  }
  return <Box flexDirection="column">{rows}</Box>
}

/** The run's artifacts as `[label, path]`, the ones that exist, in reading order. */
export function artifactList(run: RunInfo): Array<[string, string]> {
  const a = run.artifacts
  const list: Array<[string, string]> = []
  if (a.brief) list.push(['brief', a.brief])
  if (a.handoff) list.push(['handoff', a.handoff])
  a.spec_files.forEach((path, index) => list.push([`spec ${index + 1}`, path]))
  a.critic_reports.forEach((path, index) => list.push([`critic pass ${index + 1}`, path]))
  if (a.decision_log) list.push(['decision log', a.decision_log])
  if (a.verification) list.push(['verification', a.verification])
  return list
}

export function languageOf(path: string): string {
  if (path.endsWith('.feature')) return 'gherkin'
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml'
  if (path.endsWith('.json')) return 'json'
  return 'text'
}

function docView(el: Elements, model: PaneModel, doc: DocView, actions: PaneActions) {
  const { Box, Text, Button, Markdown, Code, Link } = el
  const absolute = `${model.cwd.replace(/\/+$/, '')}/${doc.path}`
  const controls = (
    <Box key="doc-controls" flexDirection="row" gap={1}>
      <Button key="back" hotkey="b" plain onPress={() => actions.closeDoc()}>back</Button>
      {model.canOpenInEditor
        ? <Button key="open" hotkey="o" plain onPress={() => actions.openInEditor(doc.path)}>open in editor</Button>
        : <Button key="copy" hotkey="c" plain onPress={() => actions.copyPath(doc.path)}>copy path</Button>}
      <Link key="file-link" href={`file://${absolute}`} label={doc.path} />
    </Box>
  )
  let body
  if (doc.error) body = <Text color="yellow">{doc.error}</Text>
  else if (doc.text === null) body = <Text dimColor>읽는 중…</Text>
  else if (doc.path.endsWith('.md')) body = <Markdown key={`md:${doc.path}`} text={doc.text} />
  else body = <Code source={doc.text} language={languageOf(doc.path)} path={doc.path} wrap="truncate-end" />
  return (
    <Box flexDirection="column">
      {controls}
      {body}
    </Box>
  )
}

function docsTab(el: Elements, model: PaneModel, actions: PaneActions) {
  const { Box, Text, Button } = el
  if (model.doc) return docView(el, model, model.doc, actions)
  const item = model.selected
  if (!item) return <Text dimColor>항목을 고르세요 (Items 탭).</Text>
  if (!item.run) return <Text dimColor>{`${item.id}: run 없음, 산출물이 없습니다.`}</Text>
  const list = artifactList(item.run)
  if (list.length === 0) return <Text dimColor>{`${item.id}: 산출물이 아직 없습니다.`}</Text>
  return (
    <Box flexDirection="column">
      <Text dimColor>{`${item.id} · ${item.run.id} · Enter로 읽기`}</Text>
      {list.map(([label, path]) => (
        <Button key={`doc:${path}`} plain onPress={() => actions.openDoc(path)}>
          <Text bold>{label}</Text> <Text dimColor>{truncate(path, Math.max(12, model.bodyColumns - label.length - 4))}</Text>
        </Button>
      ))}
    </Box>
  )
}

export function renderPane(el: Elements, model: PaneModel, actions: PaneActions, now: number) {
  const { Box, Text, Button } = el
  const read = model.read
  const header = (
    <Box key="tabs" flexDirection="row" gap={1}>
      <Button key="tab:items" hotkey="1" plain onPress={() => actions.showTab('items')}>Items</Button>
      <Button key="tab:run" hotkey="2" plain onPress={() => actions.showTab('run')}>Run</Button>
      <Button key="tab:docs" hotkey="3" plain onPress={() => actions.showTab('docs')}>Docs</Button>
      <Text dimColor>{read.snapshot ? `  ${read.snapshot.generated_by.replace(/^spec-cycle@\S+ /, '')} · ${relative(read.snapshot.generated_at, now)}` : ''}</Text>
      {read.isStale ? <Text color="yellow">⚠ 오래됨</Text> : null}
      {read.isBroken ? <Text color="yellow">⚠ JSON</Text> : null}
    </Box>
  )
  let body
  if (!read.hasFile && !read.hasConfig) body = <Text dimColor>spec-cycle 프로젝트가 아닙니다. /spec-cycle:init 으로 시작하세요.</Text>
  else if (!read.snapshot) body = <Text dimColor>스냅숏이 없습니다. spec-cycle 커맨드를 한 번 실행하거나 /lens refresh 를 쓰세요.</Text>
  else if (model.tab === 'items') body = itemsTab(el, model, actions, now)
  else if (model.tab === 'run') body = runTab(el, model)
  else body = docsTab(el, model, actions)
  return (
    <Box flexDirection="column">
      {header}
      {body}
    </Box>
  )
}
