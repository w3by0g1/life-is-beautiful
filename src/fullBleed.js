// Gets the sheet up behind a phone's status bar (the clock) in a browser tab.
//
// Phone browsers float their bars over the page, and page content shows
// through them, but a tab's page starts just below the status bar: the only
// content that ever appears behind it is content scrolled up under it. So the
// scene is made one status bar taller than the screen (the --overhang CSS
// variable, see index.css) and the page is scrolled down by that much, which
// leaves the top of the sheet behind the clock. Nothing can scroll it back:
// the canvas takes every touch for drawing.
//
// Opened from the home screen the page already starts at the top of the
// screen, and desktop browsers have nothing to go under, so this does nothing
// there.

// Never more than an iPhone's tallest status bar (CSS px), however the browser
// reports its size.
const MAX_OVERHANG = 70

export function fullBleed() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone
  if (standalone || !matchMedia('(pointer: coarse)').matches) return () => {}
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  const root = document.documentElement

  // The status bar's height, per orientation. The browser's reported page
  // height changes as its bars settle or shrink, so this keeps the largest
  // seen (the status bar itself never changes size).
  const measured = { portrait: 0, landscape: 0 }
  let overhang = 0
  const measure = () => {
    // The part of the screen above the page: the screen's height (its width
    // when sideways, which iOS doesn't swap) less the page's.
    const portrait = innerHeight >= innerWidth
    const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
    const key = portrait ? 'portrait' : 'landscape'
    measured[key] = Math.max(measured[key], Math.round(Math.min(MAX_OVERHANG, Math.max(0, screenH - innerHeight))))
    if (measured[key] !== overhang) {
      overhang = measured[key]
      root.style.setProperty('--overhang', `${overhang}px`)
    }
  }
  // Keeps the page scrolled to exactly the overhang: the browser can reset or
  // shift the scroll (on load, returning to the tab, its bars changing), so
  // it's put back whenever it drifts. Never while a finger is down, though:
  // scrolling something on top of the sheet (an artist's page, the calendar)
  // can drag the page along with it, and putting it back mid-gesture makes
  // whatever is being read jump about. It's put right once the finger lifts.
  let queued = false
  let touching = false
  const hold = () => {
    if (queued || touching) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      if (touching) return
      if (Math.abs(scrollY - overhang) > 0.5) scrollTo(0, overhang)
    })
  }
  const apply = () => {
    measure()
    hold()
  }
  apply()
  const events = ['resize', 'pageshow', 'load', 'scroll', 'orientationchange']
  for (const type of events) addEventListener(type, apply, { passive: true })
  document.addEventListener('visibilitychange', apply)
  const down = () => {
    touching = true
  }
  // A moment after the last finger leaves, so the scroll it threw has settled.
  const up = () => {
    touching = false
    setTimeout(apply, 260)
  }
  addEventListener('touchstart', down, { passive: true })
  addEventListener('touchend', up, { passive: true })
  addEventListener('touchcancel', up, { passive: true })
  // The page may not be laid out at full height yet on the first frames.
  const retries = [100, 400, 1000, 2500].map((ms) => setTimeout(apply, ms))
  return () => {
    for (const type of events) removeEventListener(type, apply)
    document.removeEventListener('visibilitychange', apply)
    removeEventListener('touchstart', down)
    removeEventListener('touchend', up)
    removeEventListener('touchcancel', up)
    retries.forEach(clearTimeout)
  }
}
