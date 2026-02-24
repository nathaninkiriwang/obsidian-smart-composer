/**
 * Heuristic to detect whether selected PDF text likely contains
 * math/equation content that was garbled by the text layer.
 */
export function containsMathContent(text: string): boolean {
  if (text.length < 3) return false

  let nonAscii = 0
  let total = 0

  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp === undefined) continue
    total++

    // Private Use Area — font-encoded math glyphs
    if (cp >= 0xe000 && cp <= 0xf8ff) return true

    // Mathematical Operators (U+2200–U+22FF)
    if (cp >= 0x2200 && cp <= 0x22ff) return true

    // Supplemental Mathematical Operators (U+2A00–U+2AFF)
    if (cp >= 0x2a00 && cp <= 0x2aff) return true

    // Miscellaneous Mathematical Symbols-A (U+27C0–U+27EF)
    if (cp >= 0x27c0 && cp <= 0x27ef) return true

    // Miscellaneous Mathematical Symbols-B (U+2980–U+29FF)
    if (cp >= 0x2980 && cp <= 0x29ff) return true

    // Mathematical Alphanumeric Symbols (U+1D400–U+1D7FF)
    if (cp >= 0x1d400 && cp <= 0x1d7ff) return true

    // Track non-ASCII characters for ratio check
    if (cp > 127) nonAscii++
  }

  // High ratio of non-ASCII in text longer than 5 chars suggests garbled math
  if (total > 5 && nonAscii / total > 0.3) return true

  return false
}
