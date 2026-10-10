// Markdown tables wider than the pane wrap into a mess on the terminal, so a
// table that cannot fit is redrawn as a list: one item per row, its first
// cell as the heading and the other cells as "header: value" beneath it.

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]

/** Terminal cells a string takes: East Asian wide characters count two. */
export function cellWidth(text: string) {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    width += WIDE.some(([from, to]) => code >= from && code <= to) ? 2 : 1
  }

  return width
}

/** The text a cell shows once its inline marks are drawn. */
const shown = (cell: string) => cell.replace(/\*\*|__|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

const isRow = (line: string) => line.trim().startsWith('|')
const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

function cells(line: string) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')

  return inner.split(/(?<!\\)\|/).map(cell => cell.trim())
}

/** Cells the table takes as the terminal draws it: each column, its padding and borders. */
function tableWidth(rows: readonly string[][]) {
  const columns = Math.max(...rows.map(row => row.length))
  let width = 1
  for (let column = 0; column < columns; column += 1) {
    width += Math.max(...rows.map(row => cellWidth(shown(row[column] ?? '')))) + 3
  }

  return width
}

function asList(header: readonly string[], body: readonly string[][]) {
  return body
    .map(row => {
      const [first = '', ...rest] = row
      const details = rest
        .map((cell, index) => (cell ? `  - ${header[index + 1] ? `${header[index + 1]}: ` : ''}${cell}` : ''))
        .filter(Boolean)

      return [`- **${first.replace(/^\*\*(.*)\*\*$/, '$1')}**`, ...details].join('\n')
    })
    .join('\n')
}

/**
 * Rewrites each table in `markdown` that is wider than `width` cells as a
 * list; narrower tables, and anything inside a code fence, stay as written.
 */
export function fitTables(markdown: string, width: number) {
  const lines = markdown.split('\n')
  const out: string[] = []
  let fence: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const marker = /^\s*(```|~~~)/.exec(line)?.[1]
    if (marker !== undefined && (fence === null || fence === marker)) {
      fence = fence === null ? marker : null
      out.push(line)
      continue
    }

    const next = lines[index + 1]
    if (fence !== null || !isRow(line) || next === undefined || !isDivider(next)) {
      out.push(line)
      continue
    }

    let end = index + 2
    while (end < lines.length && isRow(lines[end] ?? '')) end += 1
    const header = cells(line)
    const body = lines.slice(index + 2, end).map(cells)

    if (tableWidth([header, ...body]) <= width) {
      out.push(...lines.slice(index, end))
    } else {
      out.push(asList(header, body))
    }
    index = end - 1
  }

  return out.join('\n')
}
