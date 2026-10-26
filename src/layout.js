// Page layout shared by the scene and the page around it.

// The logo's size, as a fraction of the screen's shorter side.
export const LOGO_FRACTION = 0.85

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
