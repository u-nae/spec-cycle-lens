// Cell arithmetic for the band: CJK and other wide characters take two columns on the terminal.

function isWide(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f)
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe4f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f300 && codePoint <= 0x1f64f)
    || (codePoint >= 0x1f900 && codePoint <= 0x1f9ff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
}

/** How many terminal cells a string takes. */
export function cells(text: string): number {
  let width = 0
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0
    if (codePoint < 0x20 || (codePoint >= 0x300 && codePoint <= 0x36f)) continue
    width += isWide(codePoint) ? 2 : 1
  }
  return width
}

/** Cuts `text` to at most `max` cells, ending it with an ellipsis when something was cut. */
export function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  if (cells(text) <= max) return text
  if (max === 1) return '…'
  let out = ''
  let width = 0
  for (const char of text) {
    const next = cells(char)
    if (width + next > max - 1) break
    out += char
    width += next
  }
  return `${out}…`
}
