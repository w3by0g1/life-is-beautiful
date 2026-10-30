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

// Whether there's room for the logo and the artist list side by side. On a
// narrow screen there isn't, so the sheet pans up instead of right and the
// list goes above the logo (see below); the writing is set to the screen's
// width (less margins) rather than a comfortable column.
export const isTall = (width) => width <= 900

// The margin the writing keeps from the edges of a narrow screen, and the gap
// it leaves to the logo.
const tallMargin = (width) => Math.max(16, Math.round(width * 0.05))
const TALL_GAP = 28

// The artists view on a narrow screen: the sheet pans up (the view moves down
// the sheet), so the logo sits low with the names centred above it. The names
// and the logo are placed as one block, in the middle of what's on screen, so
// there isn't a pile of space left over at one end.
// listHeight: how tall the list is; view: the part of the sheet on screen
// (top and bottom, CSS px from the scene's top, as the header leaves it).
// Returns, in CSS px from the scene's top: where the logo's middle goes and
// where the list's bottom edge goes.
export function artistsLayoutTall(width, height, listHeight = 0, view = { top: 0, bottom: height }) {
  const logoHalf = ((LOGO_FRACTION * Math.min(width, height)) / 2) * 0.97
  const block = listHeight + TALL_GAP + 2 * logoHalf
  // Where the names start: centred with the logo, never under the header, and
  // if the pair is too tall for the screen it's the logo's foot that goes off
  // the bottom.
  const listTop = Math.max(view.top, view.top + (view.bottom - view.top - block) / 2)
  const listBottom = listTop + listHeight
  return { middle: listBottom + TALL_GAP + logoHalf, listBottom }
}

// The width the writing is set to on a narrow screen: the screen, less its
// margins.
export const tallTextWidth = (width) => width - 2 * tallMargin(width)
export const tallTextLeft = (width) => tallMargin(width)

// How wide the info text is set: comfortable on a big screen, and at least
// most of a phone's width.
export const infoTextWidth = (width) => Math.round(Math.min(530, Math.max(width * 0.42, width - 2 * Math.max(16, width * 0.04) - 120)))
