// Page layout shared by the scene and the page around it.

// The logo's size, as a fraction of the screen's shorter side.
export const LOGO_FRACTION = 0.85

// The artists view: the sheet pans so the logo sits a little right of centre
// (further if the list needs room), with the list right-aligned a gap to its
// left, centred on the logo's middle.
// width/height: the scene (CSS px); listWidth: the list's width (CSS px).
// Returns, in CSS px: the pan and the list's right edge (from the scene's left).
export function artistsLayout(width, height, listWidth = 0) {
  const m = Math.min(width, height)
  // Half the logo's width (its petals reach almost to the edge of its box).
  const logoHalf = ((LOGO_FRACTION * m) / 2) * 0.97
  const margin = Math.max(16, width * 0.04)
  const gap = Math.min(56, Math.max(24, width * 0.04))
  const logoLeft = Math.max(width * 0.575 - logoHalf, margin + listWidth + gap)
  return { pan: logoLeft + logoHalf - width / 2, listRight: logoLeft - gap }
}

// The info view: the mirror image, the logo a little left of centre (further
// if the text needs room), with the text a gap to its right, centred on the
// logo's middle. textWidth: the text column's width (CSS px). Returns, in CSS
// px: the pan (negative: left) and the text's left edge.
export function infoLayout(width, height, textWidth = 0) {
  const m = Math.min(width, height)
  const logoHalf = ((LOGO_FRACTION * m) / 2) * 0.97
  const margin = Math.max(16, width * 0.04)
  const gap = Math.min(56, Math.max(24, width * 0.04))
  const logoRight = Math.min(width * 0.425 + logoHalf, width - margin - textWidth - gap)
  return { pan: logoRight - logoHalf - width / 2, textLeft: logoRight + gap }
}

// How wide the info text is set: comfortable on a big screen, and at least
// most of a phone's width.
export const infoTextWidth = (width) => Math.round(Math.min(460, Math.max(width * 0.42, width - 2 * Math.max(16, width * 0.04) - 120)))
