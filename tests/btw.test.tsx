import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const btw = (args: string) =>
  ({ command: 'btw', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as const

const PANE = {
  plugin: 'better-btw',
  component: 'Pane',
  requestId: 'btw',
  props: {
    title: 'btw',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  } as never,
} as const

/**
 * The engine beneath the plugin: a fork that echoes how many earlier answers
 * it was given, and a pane that stays up from its open until its close.
 */
function engine(on: On, prompts: string[], opens: number[] = [], scrolled: number[] = []) {
  const clock = mock.clock(on)
  let isUp = false
  on('model.fork', (_$, e) => {
    prompts.push(e.prompt)
    const earlier = (e.prompt.match(/<answer>/g) ?? []).length

    return { value: { isAnswered: true as const, text: `answer ${prompts.length} (saw ${earlier})`, usage: USAGE } }
  })
  on('ui.open', () => {
    opens.push(1)
    isUp = true

    return { value: { isPlaced: true as const } }
  })
  on('ui.close', () => {
    isUp = false

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: isUp ? [{ id: 'btw', title: 'btw', isShown: true, isFocused: true, isPlaced: true }] : [],
  }))
  on('ui.focus', () => ({}))
  on('ui.scroll', (_$, e) => (scrolled.push(e.by), {}))
  on('ui.toast', () => ({ value: undefined }))

  return { clock, close: () => (isUp = false) }
}

test('one visit draws every question and answer; follow-ups carry the earlier answers', async ($, on) => {
  const prompts: string[] = []
  const { clock } = engine(on, prompts)

  const ran = await $.command.run(btw('what is X?'))
  expect(ran.text).toBeUndefined()
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Markdown', text: /answer 1 \(saw 0\)/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.input({ key: 'ask:1', text: 'and Y?' })
  await clock.settle()
  await ui.input({ key: 'ask:2', text: 'and Z?' })
  await clock.settle()

  expect(prompts).toHaveLength(3)
  expect(prompts[1]).toContain('<question>what is X?</question>')
  expect(prompts[2]).toContain('Side question: and Z?')
  // The model is told the answer width the pane drew at (80 less its inset).
  expect(prompts[2]).toContain('narrow pane 77 characters wide')
  // All three answers are on screen at once, none folded away.
  expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(3)
  expect(await ui.find({ type: 'Markdown', text: /answer 3 \(saw 2\)/ })).toBeDefined()
  expect(await ui.find({ key: 'earlier:1' })).toBeUndefined()
  await ui.unmount()
})

test('a question after the pane closed starts a new visit, folding the last one', async ($, on) => {
  const prompts: string[] = []
  const { clock, close } = engine(on, prompts)

  await $.command.run(btw('first?'))
  await clock.settle()
  close()
  await $.command.run(btw('second?'))
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(1)
  expect(await ui.find({ key: 'earlier:1' })).toBeDefined()
  // The new visit still remembers the old answer.
  expect(prompts[1]).toContain('<question>first?</question>')

  await ui.unmount()

  // A bare /btw reopens the last visit as it was.
  close()
  await $.command.run(btw(''))
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await again.find({ type: 'Markdown', text: /answer 2/ })).toBeDefined()
  await again.unmount()
})

const arrow = (by: number) =>
  ({
    component: 'Pane',
    requestId: 'btw',
    offset: 0,
    by,
    bodyRows: 10,
    contentRows: 50,
    origin: { kind: 'person' },
  }) as const

test('arrows only select; enter opens a folded question and folds an open one', async ($, on) => {
  const prompts: string[] = []
  const { clock, close } = engine(on, prompts)

  await $.command.run(btw('first?'))
  await clock.settle()
  close()
  await $.command.run(btw('second?'))
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const shows = async (answer: RegExp) => (await ui.find({ type: 'Markdown', text: answer })) !== undefined

  // Up twice reaches the folded question from the earlier visit, and up at
  // the top stays there; selecting opens nothing.
  expect(await $.ui.scroll(arrow(-1))).toEqual({})
  await $.ui.scroll(arrow(-1))
  await $.ui.scroll(arrow(-1))
  expect(await shows(/answer 1/)).toBe(false)
  expect((await ui.find({ type: 'Text', text: 'first?' }))?.props).toMatchObject({ inverse: true })

  await ui.press({ key: 'q:1' })
  expect(await shows(/answer 1/)).toBe(true)
  await ui.press({ key: 'q:1' })
  expect(await shows(/answer 1/)).toBe(false)

  // This visit's answer starts open; enter folds it and opens it again.
  expect(await shows(/answer 2/)).toBe(true)
  await ui.press({ key: 'q:2' })
  expect(await shows(/answer 2/)).toBe(false)
  await ui.press({ key: 'q:2' })
  expect(await shows(/answer 2/)).toBe(true)

  // Down past the newest returns to the field: no question is selected.
  await $.ui.scroll(arrow(1))
  await $.ui.scroll(arrow(1))
  expect((await ui.find({ type: 'Text', text: 'second?' }))?.props).toMatchObject({ bold: true, inverse: false })
  await ui.unmount()
})

test('the wheel and the page keys still scroll', async ($, on) => {
  const prompts: string[] = []
  const scrolled: number[] = []
  const { clock, close } = engine(on, prompts, [], scrolled)

  await $.command.run(btw('first?'))
  await clock.settle()
  close()
  await $.command.run(btw('second?'))
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  scrolled.length = 0

  await $.ui.scroll({ ...arrow(-1), pointer: { column: 3, row: 2 } })
  await $.ui.scroll(arrow(-10))
  expect(scrolled).toEqual([-1, -10])
  expect(await ui.find({ type: 'Markdown', text: /answer 1/ })).toBeUndefined()
  await ui.unmount()
})

test('a bare /btw with no history only shows usage', async ($, on) => {
  const prompts: string[] = []
  const opens: number[] = []
  engine(on, prompts, opens)

  await $.command.run(btw(''))
  expect(opens).toHaveLength(0)
  expect(prompts).toHaveLength(0)
})
