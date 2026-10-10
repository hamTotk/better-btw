import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelForkResult, Register } from 'claude-code'

import type { BtwExchange } from '../types'
import { fitTables } from './tables'

const PANE = 'btw'
const KEEP = 20
/** Cells an answer loses inside the pane: the pane's padding and the answer's indent. */
const ANSWER_INSET = 3

// The answer width the pane last drew at, told to the model with each question
// (a module value: a reload resets it until the pane draws again).
let answerColumns = 77

const exchanges = atom({ plugin: 'better-btw', key: 'exchanges' } as const, [] as BtwExchange[])
const viewing = atom({ plugin: 'better-btw', key: 'viewing' } as const, null as number | null)
const asked = atom({ plugin: 'better-btw', key: 'asked' } as const, 0)
const visitStart = atom({ plugin: 'better-btw', key: 'visitStart' } as const, 0)
const toggled = atom({ plugin: 'better-btw', key: 'toggled' } as const, [] as number[])

// The built-in /btw's rules, with its "no follow-up turns" line swapped for
// one that points the model at the earlier side questions.
const RULES = `<system-reminder>This is a side question from the user. You must answer this question directly in a single response.

IMPORTANT CONTEXT:
- You are a separate, lightweight agent spawned to answer side questions
- The main agent is NOT interrupted - it continues working independently in the background
- You share the conversation context but are a completely separate instance
- Do NOT reference being interrupted or what you were "previously doing" - that framing is incorrect

CRITICAL CONSTRAINTS:
- You have NO tools available - you cannot read files, run commands, search, or take any actions
- Do NOT write tool calls or tool output as text - nothing you write here is executed; if answering would need reading files, running commands, or searching, say that can't be checked from a side question and suggest asking in the main conversation
- The user may ask follow-ups: earlier side questions and your answers to them are listed below, oldest first. Build on them without repeating them
- You can ONLY provide information based on what you already know from the conversation context
- NEVER say things like "Let me try...", "I'll now...", "Let me check...", or promise to take any action
- If you don't know the answer, say so - do not offer to look it up or investigate

Simply answer the question with the information you have.</system-reminder>`

const isPending = (x: BtwExchange) => x.response === undefined && x.error === undefined

const oneLine = (text: string, width: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length > width ? `${flat.slice(0, Math.max(1, width - 1))}…` : flat
}

function composePrompt(earlier: readonly BtwExchange[], question: string) {
  const answered = earlier.filter(x => x.response !== undefined)
  const thread = answered.length === 0
    ? ''
    : `\n\n<earlier_side_questions>\n${answered
        .map(x => `<question>${x.question}</question>\n<answer>${x.response}</answer>`)
        .join('\n')}\n</earlier_side_questions>`

  const layout = `<display>Your answer is drawn in a narrow pane ${answerColumns} characters wide (East Asian characters take two). Use a table only if every row fits in that width; otherwise use a bulleted list.</display>`

  return `${RULES}${thread}\n\n${layout}\n\nSide question: ${question}`
}

function describeFailure(reply: Exclude<ModelForkResult, { isAnswered: true }>) {
  switch (reply.reason) {
    case 'nothing-to-fork':
      return 'Nothing to ask about yet: send a prompt first, then use /btw.'
    case 'api-error':
      return `(API error${'status' in reply && reply.status ? `: ${reply.status}` : ''})`
    case 'empty-reply':
      return '(No answer available for this side question. Try again, or ask in the main conversation.)'
    case 'aborted':
      return '(Cancelled.)'
  }
}

const showLatest = ($: EngineInterface) => void $.ui.scroll({ in: PANE, to: 'end' }).catch(() => undefined)

/**
 * Adds the question to the thread and answers it in the background; false
 * when one is still running. `isNewVisit` starts what the pane shows afresh.
 */
async function ask($: EngineInterface, question: string, isNewVisit: boolean) {
  const before = await read($, exchanges)
  if (before.some(isPending)) {
    $.ui.toast('/btw: still answering the last question')

    return false
  }

  const id = (await read($, asked)) + 1
  await update($, asked, () => id)
  if (isNewVisit) await update($, visitStart, () => id)
  await update($, exchanges, list => [...list, { id, question }].slice(-KEEP))
  await update($, viewing, () => null)

  $.clock.after(0, () => void answer($, before, id, question))

  return true
}

async function answer($: EngineInterface, earlier: readonly BtwExchange[], id: number, question: string) {
  let settled: BtwExchange
  try {
    const reply = await $.model.fork({ prompt: composePrompt(earlier, question) })
    settled = reply.isAnswered
      ? { id, question, response: reply.text }
      : { id, question, error: describeFailure(reply) }
  } catch (error) {
    settled = { id, question, error: `(Failed to get response: ${String(error)})` }
  }

  await update($, exchanges, list => list.map(x => (x.id === id ? settled : x)))
  showLatest($)
}

const openPane = ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: 'btw', focus: true, closeOnEscape: true, rows: 40 })


const clearAll = async ($: EngineInterface) => {
  await update($, exchanges, () => [])
  await update($, viewing, () => null)
  await update($, toggled, () => [])
  await $.ui.close({ id: PANE })
}

const EARLIER_SHOWN = 5

/**
 * What the pane lists, in order: the earlier visits folded to their last few
 * lines (`hidden` more above them), then every exchange of this visit.
 */
function layout(list: readonly BtwExchange[], start: number) {
  const earlier = list.filter(x => x.id < start)
  const hidden = Math.max(0, earlier.length - EARLIER_SHOWN)

  return { hidden, earlier: earlier.slice(hidden), current: list.filter(x => x.id >= start) }
}

const questionKey = (id: number) => `q:${id}`
const idOf = (key: string | undefined) => (key?.startsWith('q:') ? Number(key.slice(2)) : undefined)

/**
 * Moves the selection one question up or down: up from the follow-up field
 * picks the newest question, down from the newest goes back to the field.
 */
async function step($: EngineInterface, by: number) {
  const { earlier, current } = layout(await read($, exchanges), await read($, visitStart))
  const ids = [...earlier, ...current].map(x => x.id)
  const at = await read($, viewing)
  const index = at === null ? ids.length : ids.indexOf(at)
  const to = Math.min(ids.length, Math.max(0, (index < 0 ? ids.length : index) + Math.sign(by)))
  const id = ids[to]
  // Selected here as well as when the ring lands, so the pick shows even
  // where the ring cannot move (the site does not hold the keys).
  await update($, viewing, () => id ?? null)

  if (id === undefined) {
    await $.ui.focus({ requestId: PANE, key: `ask:${await read($, asked)}` }).catch(() => undefined)
    showLatest($)

    return
  }

  await $.ui.focus({ requestId: PANE, key: questionKey(id) }).catch(() => undefined)
  void $.ui.scroll({ in: PANE, to: { key: questionKey(id) }, block: 'start' }).catch(() => undefined)
}

export const register: Register = on => {
  // A reload drops the module's in-flight answers: settle them so the next ask
  // is not blocked. Rows from 0.1.0, which had no id, are dropped.
  on('session.start', async ($, e, next) => {
    await update($, exchanges, list =>
      list
        .filter(x => typeof x.id === 'number')
        .map(x => (isPending(x) ? { ...x, error: '(Interrupted before it finished. Ask again to retry.)' } : x)),
    )

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await clearAll($)

    return next(e)
  })

  // Answers the built-in /btw in its place: the engine's own panel never opens.
  // A question typed while the pane is closed starts a new visit; a bare /btw
  // reopens the last one as it was.
  on('command.run', { command: 'btw' }, async ($, e) => {
    const question = e.args.trim()
    if (question) {
      const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
      await ask($, question, !isUp)
    } else if ((await read($, exchanges)).length === 0) {
      $.ui.toast('Usage: /btw <your question>')

      return {}
    } else {
      await update($, viewing, () => null)
    }

    await openPane($)
    showLatest($)

    return {}
  })

  // The selected question is the one holding the focus ring: landing on a
  // question selects it, landing anywhere else (the field, copy) clears it.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    if (moved.deny === undefined) {
      const id = idOf(e.element)
      if (id !== undefined || e.element?.startsWith('ask:')) await update($, viewing, () => id ?? null)
    }

    return moved
  })

  // Up and down select questions instead of scrolling. The wheel (it carries a
  // pointer), the page keys and the plugin's own scrolls still move the window.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person' || e.pointer !== undefined || Math.abs(e.by) !== 1) return next(e)
    await step($, e.by)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = table
    const Input = 'Input' in table ? table.Input : undefined

    const list = await read($, exchanges)
    const picked = await read($, viewing)
    const count = await read($, asked)
    const start = await read($, visitStart)
    const width = Math.max(20, e.props.bodyColumns - 8)
    answerColumns = Math.max(20, e.props.bodyColumns - ANSWER_INSET)

    if (list.length === 0) {
      return <Text dimColor>No side questions yet. Type /btw &lt;your question&gt;.</Text>
    }

    const bodyOf = (x: BtwExchange) =>
      x.response !== undefined ? (
        <Markdown text={fitTables(x.response, answerColumns)} />
      ) : x.error !== undefined ? (
        <Text color="error">{x.error}</Text>
      ) : (
        <Text dimColor>Answering…</Text>
      )

    // Earlier visits fold to one line each, as the built-in lists them; this
    // visit's answers are all drawn. Enter on a question flips it: opens a
    // folded one, folds an open one.
    const { hidden, earlier, current } = layout(list, start)
    const flipped = await read($, toggled)
    const isOpen = (x: BtwExchange) => (x.id >= start) !== flipped.includes(x.id)
    const toggle = (id: number) =>
      update($, toggled, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id]))
    // A Button can be neither bold nor colored, so the question is drawn as
    // Text and a one-cell Button after it takes the focus ring and the Enter.
    const handle = (id: number) => <Button key={questionKey(id)} plain label=" " onPress={() => toggle(id)} />
    const copied = (list.find(x => x.id === picked) ?? current.findLast(x => x.response !== undefined))?.response

    const submit = (text: string) => {
      const question = text.trim()
      if (!question) return
      void ask($, question, false).then(isAsked => {
        if (!isAsked) return
        void $.ui.focus({ requestId: PANE, key: `ask:${count + 1}` }).catch(() => undefined)
        showLatest($)
      })
    }

    return (
      <Box flexDirection="column" paddingLeft={1} rowGap={1}>
        {hidden > 0 && <Text dimColor>(+{hidden} earlier /btw)</Text>}
        {earlier.map(x => (
          <Box key={`earlier:${x.id}`} flexDirection="column">
            <Box>
              <Text dimColor>❯ </Text>
              <Text inverse={picked === x.id}>
                {oneLine(x.question, width)}
              </Text>
              {handle(x.id)}
            </Box>
            {isOpen(x) && (
              <Box marginTop={1} marginLeft={2} flexDirection="column">
                {bodyOf(x)}
              </Box>
            )}
          </Box>
        ))}
        {current.map(x => (
          <Box key={`turn:${x.id}`} flexDirection="column">
            <Box>
              <Text color="warning" bold>
                ❯{' '}
              </Text>
              <Text bold inverse={picked === x.id}>
                {x.question}
              </Text>
              {handle(x.id)}
            </Box>
            {isOpen(x) ? (
              <Box marginTop={1} marginLeft={2} flexDirection="column">
                {bodyOf(x)}
              </Box>
            ) : (
              <Box marginLeft={2}>
                <Text dimColor>… (enter to open)</Text>
              </Box>
            )}
          </Box>
        ))}
        {Input && (
          <Box>
            <Input
              key={`ask:${count}`}
              label="❯ "
              placeholder="Ask a follow-up…"
              submitLabel="ask"
              autoFocus
              onSubmit={submit}
            />
          </Box>
        )}
        <Box>
          <Text dimColor>↑/↓ select · enter open/fold · esc close · </Text>
          {copied !== undefined && (
            <Button
              key="copy"
              plain
              dimColor
              label="copy"
              onPress={() => void $.ui.copy({ text: copied, surface: e.surface })}
            />
          )}
          {copied !== undefined && <Text dimColor> · </Text>}
          <Button key="clear" plain dimColor label="clear history" onPress={() => clearAll($)} />
        </Box>
      </Box>
    )
  })
}
