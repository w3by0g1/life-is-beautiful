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
  // The room the list keeps from the screen's left edge (it only comes to
  // that on a narrow screen).
  const margin = Math.max(36, width * 0.06)
  const gap = Math.min(56, Math.max(24, width * 0.04))
  const logoLeft = Math.max(width * 0.575 - logoHalf, margin + listWidth + gap)
  return { pan: logoLeft + logoHalf - width / 2, listRight: logoLeft - gap }
}

// Whether the screen is narrow, so the writing is set to its width (less
// margins) rather than a comfortable column.
export const isTall = (width) => width <= 900

// The margin the writing keeps from the edges of a narrow screen.
const tallMargin = (width) => Math.max(16, Math.round(width * 0.05))

// The width the writing is set to on a narrow screen: the screen, less its
// margins.
export const tallTextWidth = (width) => width - 2 * tallMargin(width)

// How wide the info text is set: comfortable on a big screen, and at least
// most of a phone's width.
export const infoTextWidth = (width) => Math.round(Math.min(530, Math.max(width * 0.42, width - 2 * Math.max(16, width * 0.04) - 120)))
