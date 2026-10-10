import { expect, test } from 'claude-code/testing'

import { cellWidth, fitTables } from '../hooks/tables'

const TABLE = [
  '| 案 | 長所 | 短所 |',
  '|---|---|---|',
  '| **A** | 速い | 高い |',
  '| B | 安い | 遅い |',
].join('\n')

test('wide characters take two cells', async () => {
  expect(cellWidth('ab')).toBe(2)
  expect(cellWidth('長所')).toBe(4)
})

test('a table that fits stays a table', async () => {
  expect(fitTables(TABLE, 40)).toBe(TABLE)
})

test('a table wider than the pane becomes a list, one item per row', async () => {
  const text = `前置き\n\n${TABLE}\n\n後書き`
  const fitted = fitTables(text, 12)

  expect(fitted).toBe(
    ['前置き', '', '- **A**', '  - 長所: 速い', '  - 短所: 高い', '- **B**', '  - 長所: 安い', '  - 短所: 遅い', '', '後書き'].join('\n'),
  )
})

test('a table inside a code fence is left alone', async () => {
  const text = `\`\`\`\n${TABLE}\n\`\`\``

  expect(fitTables(text, 12)).toBe(text)
})
