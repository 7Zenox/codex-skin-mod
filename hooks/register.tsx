import type { EngineInterface, Register } from 'claude-code'

// Palette lifted from codex-rs/tui/src/style.rs and a live capture of codex 0.160.
const ACCENT = '#63A8F8' // UI_ACCENT, ChatGPT Blue 200
const DIM = '#7A7A7A' // codex blends fg 60% toward bg; fixed approximation for #c1c1c1 on #000
const USER_BG = '#2A2A2A' // matches codex's composer box
const OK = '#7BC47F'
const ERR = '#E07A7A'
const MAX_OUTPUT_LINES = 5
const MODEL = '#F6E2B7'
const CWD = '#ABDFA7'

let footer: { model: string; cwd: string; repo: string | null } | null = null
const REPO = '#B4B4F8' // codex's lavender session-title color
// claude-sonnet-5-5 -> "Sonnet 5.5"
const niceModel = (m: string) =>
  m.replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-')
    .map(w => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
    .replace(/(\d) (\d)/, '$1.$2')
// TurnDuration has no end-time prop; remember when each line was first drawn so redraws keep it.
const endedAt = new Map<string, Date>()
const fmtDur = (ms: number) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s` }
const fmtTime = (d: Date) => { const h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` } // codex shows a head then "… +N lines"

// Tools whose whole row (header + body) this mod draws itself.
const OWNED = new Set(['Bash', 'Edit', 'Write', 'TodoWrite'])

type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

const base = (p: string) => p.split('/').pop() || p

function toUnified(hunks: Hunk[]): { diff: string; added: number; removed: number } {
  let added = 0
  let removed = 0
  const out: string[] = []
  for (const h of hunks) {
    out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`)
    for (const l of h.lines) {
      if (l.startsWith('+')) added++
      else if (l.startsWith('-')) removed++
      out.push(l)
    }
  }
  return { diff: out.join('\n'), added, removed }
}

async function drawTool($: EngineInterface, e: any): Promise<JSX.Element | null> {
  const p = e.props
  if (!OWNED.has(p.tool) || p.isErrored) return null
  const { Box, Text, Code } = $.ui.resolve(e)
  const input = p.input as Record<string, any>
  const output = p.output as Record<string, any> | undefined

  const header = (verb: string, rest: string, extra?: string) => (
    <Box flexDirection="row">
      <Text color={DIM}>{'• '}</Text>
      <Text bold>{verb} </Text>
      <Text>{rest}</Text>
      {extra ? <Text color={DIM}> {extra}</Text> : null}
    </Box>
  )
  const branch = (lines: Array<string | JSX.Element>) => (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Box flexDirection="row" key={String(i)}>
          <Text color={DIM}>{i === 0 ? '  └ ' : '    '}</Text>
          {typeof l === 'string' ? <Text color={DIM}>{l}</Text> : l}
        </Box>
      ))}
    </Box>
  )

  if (p.tool === 'Bash') {
    const cmd = String(input.command ?? '').split('\n')[0] ?? ''
    if (p.isRunning) return header('Running', cmd)
    if (p.isInterrupted) return <Box flexDirection="column">{header('Ran', cmd)}{branch(['Interrupted'])}</Box>
    const text = `${output?.stdout ?? ''}${output?.stderr ? `\n${output.stderr}` : ''}`.trimEnd()
    const all = text ? text.split('\n') : []
    const shown: string[] = all.length ? all.slice(0, MAX_OUTPUT_LINES) : ['(no output)']
    if (all.length > MAX_OUTPUT_LINES) shown.push(`+ ${all.length - MAX_OUTPUT_LINES} lines (^o to expand)`)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text color={OK}>{'• '}</Text>
          <Text bold>Ran </Text>
          <Code source={cmd} language="bash" wrap="truncate-end" />
        </Box>
        {branch(shown)}
      </Box>
    )
  }

  if (p.tool === 'Edit' || p.tool === 'Write') {
    const path = String(input.file_path ?? '')
    if (p.isRunning || !output) return header(p.tool === 'Write' ? 'Writing' : 'Editing', path)
    const hunks = (output.structuredPatch ?? []) as Hunk[]
    const verb = p.tool === 'Write' && output.type === 'create' ? 'Added' : 'Edited'
    if (!hunks.length) return header(verb, path)
    const { diff, added, removed } = toUnified(hunks)
    return (
      <Box flexDirection="column">
        {header(verb, path, `(+${added} -${removed})`)}
        <Box paddingLeft={4}>
          <Code source={diff} format="diff" path={path} />
        </Box>
      </Box>
    )
  }

  if (p.tool === 'TodoWrite') {
    const todos = (input.todos ?? []) as Array<{ content: string; status: string }>
    return (
      <Box flexDirection="column">
        {header('Updated Plan', '')}
        {branch(
          todos.map(t => (
            <Text
              color={t.status === 'completed' ? OK : t.status === 'in_progress' ? ACCENT : undefined}
              strikethrough={t.status === 'completed'}
            >
              {t.status === 'completed' ? '✔ ' : '□ '}
              {t.content}
            </Text>
          )),
        )}
      </Box>
    )
  }

  return null
}


// ---- full text justification (plain paragraphs only) ----
// Split markdown into blocks on blank lines, but never inside a ``` fence.
function splitBlocks(text: string): string[] {
  const blocks: string[] = []
  let cur: string[] = []
  let fenced = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (!fenced && line.trim() === '' && !/^\s*(```|~~~)/.test(line)) {
      if (cur.length) blocks.push(cur.join('\n'))
      cur = []
    } else cur.push(line)
  }
  if (cur.length) blocks.push(cur.join('\n'))
  return blocks
}

const MAX_GAP = 3 // a line that would need wider average gaps than this stays left-aligned

type Seg = { t: string; k: 'plain' | 'bold' | 'code' | 'link' }
type Word = { segs: Seg[]; len: number }
type Line = Seg[]
type Block =
  | { kind: 'md'; text: string; first: boolean }
  | { kind: 'text'; indent: number; marker: string; words: Word[]; first: boolean }

// `code`, **bold** and [text](url) become styled segments; everything else is literal text.
function parseInline(s: string): Seg[] {
  const out: Seg[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), k: 'plain' })
    if (m[1] !== undefined) out.push({ t: m[1], k: 'code' })
    else if (m[2] !== undefined) out.push({ t: m[2], k: 'bold' })
    else out.push({ t: m[3] ?? '', k: 'link' })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ t: s.slice(last), k: 'plain' })
  return out
}

// Split into breakable words. A code span never breaks, and glues to adjacent punctuation.
function toWords(segs: Seg[]): Word[] {
  const words: Word[] = []
  let cur: Seg[] = []
  const flush = () => {
    if (cur.length) words.push({ segs: cur, len: cur.reduce((n, g) => n + g.t.length, 0) })
    cur = []
  }
  for (const g of segs) {
    if (g.k === 'code') {
      cur.push(g)
      continue
    }
    for (const piece of g.t.split(/(\s+)/)) {
      if (piece === '') continue
      if (/^\s+$/.test(piece)) flush()
      else cur.push({ t: piece, k: g.k })
    }
  }
  flush()
  return words
}

// Greedy wrap, then pad the gaps of every line but the last so both edges are flush.
function layout(words: Word[], width: number): Line[] {
  const rows: Word[][] = []
  let cur: Word[] = []
  let len = 0
  for (const w of words) {
    const add = cur.length ? len + 1 + w.len : w.len
    if (cur.length && add > width) {
      rows.push(cur)
      cur = [w]
      len = w.len
    } else {
      cur.push(w)
      len = add
    }
  }
  if (cur.length) rows.push(cur)
  return rows.map((ws, i) => {
    const gaps = ws.length - 1
    const wordsLen = ws.reduce((n, w) => n + w.len, 0)
    let base = 1
    let extra = 0
    if (i < rows.length - 1 && gaps > 0 && wordsLen + gaps < width) {
      const pad = width - wordsLen
      if (pad / gaps <= MAX_GAP) {
        base = Math.floor(pad / gaps)
        extra = pad % gaps
      }
    }
    const line: Line = []
    ws.forEach((w, j) => {
      if (j > 0) line.push({ t: ' '.repeat(base + (j - 1 < extra ? 1 : 0)), k: 'plain' })
      line.push(...w.segs)
    })
    return line
  })
}

// Paragraphs and list items are laid out here; tables, headings, quotes and code stay with the engine.
function toBlocks(text: string): Block[] {
  const out: Block[] = []
  for (const raw of splitBlocks(text)) {
    const lines = raw.split('\n')
    if (lines.some(l => /^\s*(```|~~~|#{1,6}\s|>|\||-{3,}\s*$|={3,}\s*$)/.test(l))) {
      out.push({ kind: 'md', text: raw, first: true })
      continue
    }
    let first = true
    let cur: { indent: number; marker: string; parts: string[] } | null = null
    const flush = () => {
      if (cur) {
        out.push({ kind: 'text', indent: cur.indent, marker: cur.marker, words: toWords(parseInline(cur.parts.join(' '))), first })
        first = false
      }
      cur = null
    }
    for (const l of lines) {
      const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l)
      if (m) {
        flush()
        cur = { indent: (m[1] ?? '').length, marker: `${m[2] ?? ''} `, parts: [m[3] ?? ''] }
      } else if (cur) (cur as { parts: string[] }).parts.push(l.trim())
      else cur = { indent: 0, marker: '', parts: [l.trim()] }
    }
    flush()
  }
  return out
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Session-scoped footer, codex's "model · cwd" line.
    const [model, cwd] = await Promise.all([$.session.model(), $.session.cwd()])
    const repo = await $.session.repo().catch(() => null)
    footer = { model: niceModel(model), cwd: cwd.replace(/^\/Users\/[^/]+/, '~'), repo: repo?.name ?? null }
    $.ui.status(undefined)
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) =>
    next({ ...e, props: { ...e.props, word: 'Working', suffix: '' } }),
  )

  on('ui.render', { component: 'TurnDuration' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    let at = endedAt.get(e.requestId)
    if (!at) endedAt.set(e.requestId, (at = new Date()))
    return (
      <Box marginTop={1}>
        <Text color={DIM}>Worked for {fmtDur(e.props.durationMs)} • {fmtTime(at)}</Text>
      </Box>
    )
  })

  // codex footer: colored "model · cwd" over the engine's own hint.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!footer) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const cols = e.viewport?.columns ?? 100
    // Engine draws the mode pill ("▸▸ auto mode on", ~17 cells) to the left of this tree;
    // one row: model · cwd on the left, the key hints pushed to the right edge.
    // The engine's own hint varies ("(shift+tab to cycle)", "(shift+tab to cycle) · ← for agents",
    // "? for shortcuts"…); split it, drop the parens, dedupe, and make sure the two codex hints are there.
    const parts = e.props.hint.replace(/[()]/g, '').split(/\s*·\s*/).map(x => x.trim()).filter(Boolean)
    for (const extra of ['← for agents', '? for shortcuts']) if (!parts.includes(extra)) parts.push(extra)
    const hints = parts.join(' · ')
    return (
      <Box flexDirection="row" flexGrow={1} width={Math.max(40, cols - 24)} justifyContent="space-between">
        <Box flexDirection="row">
          <Text color={MODEL}>{footer.model}</Text>
          <Text color={DIM}> · </Text>
          <Text color={CWD}>{footer.cwd}</Text>
          {footer.repo ? <Text color={DIM}> · </Text> : null}
          {footer.repo ? <Text color={REPO}>{footer.repo}</Text> : null}
        </Box>
        <Text color={DIM}>{hints}</Text>
      </Box>
    )
  })

  // Shaded full-width block with a "› " prefix.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const p = e.props
    if (p.isExpanded || p.task || p.from) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box backgroundColor={USER_BG} width="100%" paddingRight={1} paddingY={1} marginTop={1}>
        <Text color={DIM} bold>{'› '}</Text>
        <Text>{p.text}</Text>
      </Box>
    )
  })

  // "• " opens a reply, continuation blocks indent under it.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const p = e.props
    const { Box, Text, Markdown } = $.ui.resolve(e)
    // bullet (2) + slack so a justified line never touches the edge and wraps
    const width = Math.max(30, (e.viewport?.columns ?? 100) - 6)
    const blocks = toBlocks(p.text)
    return (
      <Box flexDirection="row" marginTop={1}>
        <Text color={DIM}>{p.isFirstOfReply || p.isSummary ? '• ' : '  '}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {blocks.map((b, i) =>
            b.kind === 'md' ? (
              <Box key={String(i)} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
                <Markdown text={b.text} />
              </Box>
            ) : (
              <Box key={String(i)} flexDirection="row" paddingLeft={b.indent} marginTop={i === 0 || !b.first ? 0 : 1}>
                {b.marker ? <Text color={DIM}>{b.marker}</Text> : null}
                <Box flexDirection="column">
                  {layout(b.words, Math.max(20, width - b.indent - b.marker.length)).map(line => (
                    <Text wrap="truncate-end">
                      {line.map(g =>
                        g.k === 'code' ? (
                          <Text color={REPO}>{g.t}</Text>
                        ) : g.k === 'bold' ? (
                          <Text bold>{g.t}</Text>
                        ) : g.k === 'link' ? (
                          <Text color={ACCENT} underline>{g.t}</Text>
                        ) : (
                          <Text>{g.t}</Text>
                        ),
                      )}
                    </Text>
                  ))}
                </Box>
              </Box>
            ),
          )}
          {p.isSummary ? <Text color={DIM}>summary</Text> : null}
        </Box>
      </Box>
    )
  })


  // One blank line above every tool block, like codex.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const tree = await drawTool($, e)
    if (!tree) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box flexDirection="column" marginTop={1}>{tree}</Box>
  })

  // The ToolUse tree above already draws the body; blank the separate result
  // block for those tools so output isn't shown twice. Errors keep the engine's.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!OWNED.has(e.props.tool) || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // Folded runs of reads/searches: "• Explored └ Read a / Search b".
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const p = e.props
    if (p.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const label = (c: { tool: string; input: unknown }) => {
      const i = (c.input ?? {}) as Record<string, any>
      if (c.tool === 'Read') return ['Read', base(String(i.file_path ?? ''))]
      if (c.tool === 'Grep') return ['Search', String(i.pattern ?? '')]
      if (c.tool === 'Glob') return ['List', String(i.pattern ?? '')]
      return [c.tool, '']
    }
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text color={DIM}>{'• '}</Text>
          <Text bold>{p.isActive ? 'Exploring' : 'Explored'}</Text>
        </Box>
        {p.calls.map((c, i) => {
          const [verb, arg] = label(c)
          return (
            <Box flexDirection="row" key={String(i)}>
              <Text color={DIM}>{i === 0 ? '  └ ' : '    '}</Text>
              <Text color={c.isErrored ? ERR : ACCENT}>{verb} </Text>
              <Text>{arg}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
