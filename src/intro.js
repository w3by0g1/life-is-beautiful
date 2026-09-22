import introBank from './assets/intro-path.json'

// Records drawing sessions into a bank, and replays them as a second "ghost"
// pen: a random recording starts once the logo has embossed, and another random
// one REPLAY_GAP seconds after each finishes. The ghost draws ink and presses
// the logo but doesn't move the light, and it runs alongside the user, who can
// draw at the same time.
//
// While developing, a Record / Stop button sits in the top-left corner. After
// Record, the next press starts the recording, which logs every pointer
// movement (presses, drags, releases and the hovering between strokes) until
// Stop. The dev server then adds it to the bank in src/assets/intro-path.json
// (see vite.config.js), so it ships with the site. Next to it, Recordings opens
// a list of the bank, each with a preview of its path, to play or delete.
//
// Positions are stored relative to the page centre, in units of the shorter
// screen side (as the logo is sized), so drawings line up with the logo at any
// window size.

// Seconds after the logo finishes embossing before the first replay.
const REPLAY_DELAY = 0.3
// Seconds between one replay finishing and the next starting.
const REPLAY_GAP = 30
// Longest recording kept, in seconds.
const RECORD_MAX = 120

const DOWN = 0
const MOVE = 1
const UP = 2

// The saved recordings, as lists of [type, ms, x, y] events. (Older files held
// a single recording.)
function recordingsIn(saved) {
  if (saved?.recordings) return saved.recordings.map((r) => r.events).filter((e) => e?.length)
  if (saved?.events?.length) return [saved.events]
  return []
}

// element: the canvas (for positions); container: where the Record button
// goes; down/move/up: the ghost pen's handlers, taking events with clientX,
// clientY and timeStamp.
export function createIntro({ element, container, down, move, up }) {
  const bank = recordingsIn(introBank)
  // When each was recorded (for the list), where known.
  const recordedAt = introBank?.recordings?.map((r) => r.recordedAt) ?? []
  // The recording in progress, if any; the replay in progress, if any; when the
  // next replay may start (performance.now ms); the last recording played.
  let rec = null
  let replay = null
  let nextAt = null
  let lastPlayed = -1

  // Record / Stop button (only while developing: saving needs the dev server).
  let button = null
  let listButton = null
  let panel = null
  const setButton = (recording) => {
    button.textContent = recording ? '■ Stop' : `● Record intro${bank.length ? ` (${bank.length} saved)` : ''}`
    button.title = recording
      ? 'Stop and add this drawing to the intro bank'
      : 'Record a drawing to add to the intros that replay after the logo embosses'
    button.style.color = recording ? '#fff' : 'rgba(200, 20, 60, 0.85)'
    button.style.background = recording ? 'rgba(200, 20, 60, 0.85)' : 'rgba(255, 255, 255, 0.7)'
  }
  if (import.meta.env.DEV) {
    button = document.createElement('button')
    Object.assign(button.style, {
      position: 'fixed',
      // Clear of a phone's status bar and rounded corners.
      top: 'calc(12px + env(safe-area-inset-top, 0px))',
      left: 'calc(12px + env(safe-area-inset-left, 0px))',
      zIndex: 1,
      font: '12px/1 system-ui, sans-serif',
      padding: '7px 11px',
      border: '1px solid rgba(200, 20, 60, 0.5)',
      borderRadius: '999px',
      cursor: 'pointer',
    })
    setButton(false)
    button.addEventListener('click', () => {
      if (rec) save()
      else {
        rec = { events: [], start: null, held: false }
        setButton(true)
      }
    })
    container.appendChild(button)

    listButton = document.createElement('button')
    Object.assign(listButton.style, {
      position: 'fixed',
      top: 'calc(12px + env(safe-area-inset-top, 0px))',
      right: 'calc(12px + env(safe-area-inset-right, 0px))',
      zIndex: 1,
      font: '12px/1 system-ui, sans-serif',
      padding: '7px 11px',
      border: '1px solid rgba(0, 0, 0, 0.2)',
      borderRadius: '999px',
      cursor: 'pointer',
      color: '#333',
      background: 'rgba(255, 255, 255, 0.7)',
    })
    listButton.textContent = `☰ Recordings (${bank.length})`
    listButton.title = 'View, play or delete the saved intro recordings'
    listButton.addEventListener('click', () => (panel ? closePanel() : openPanel()))
    container.appendChild(listButton)
  }

  // The list of saved recordings.
  const closePanel = () => {
    panel?.remove()
    panel = null
  }
  const preview = (events) => {
    // The path as an SVG: each stroke (press to release) a polyline, in the
    // recording's shorter-side units around the page centre.
    const strokes = []
    let cur = null
    for (const [type, , x, y] of events) {
      if (type === DOWN) strokes.push((cur = [[x, y]]))
      else if (type === MOVE && cur) cur.push([x, y])
      else if (type === UP) cur = null
    }
    const pts = strokes.flat()
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const pad = 0.05
    const x0 = Math.min(-0.5, ...xs) - pad
    const y0 = Math.min(-0.5, ...ys) - pad
    const size = Math.max(Math.max(0.5, ...xs) + pad - x0, Math.max(0.5, ...ys) + pad - y0)
    const lines = strokes
      .map((s) => `<polyline points="${s.map(([x, y]) => `${(x - x0).toFixed(3)},${(y - y0).toFixed(3)}`).join(' ')}" />`)
      .join('')
    // The logo's square (shorter-side units: the logo fills 0.85 of it).
    const logo = `<rect x="${(-0.425 - x0).toFixed(3)}" y="${(-0.425 - y0).toFixed(3)}" width="0.85" height="0.85" fill="none" stroke="#ddd" stroke-width="${size / 80}" />`
    return `<svg viewBox="0 0 ${size.toFixed(3)} ${size.toFixed(3)}" width="72" height="72" style="flex:none;background:#fafafa;border-radius:6px">${logo}<g fill="none" stroke="#1c2a22" stroke-width="${size / 60}" stroke-linecap="round" stroke-linejoin="round">${lines}</g></svg>`
  }
  const openPanel = () => {
    closePanel()
    panel = document.createElement('div')
    Object.assign(panel.style, {
      position: 'fixed',
      top: 'calc(48px + env(safe-area-inset-top, 0px))',
      right: 'calc(12px + env(safe-area-inset-right, 0px))',
      zIndex: 2,
      width: 'min(320px, calc(100vw - 24px))',
      maxHeight: '60vh',
      overflowY: 'auto',
      padding: '8px',
      borderRadius: '10px',
      background: 'rgba(255, 255, 255, 0.95)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      font: '12px/1.4 system-ui, sans-serif',
      color: '#333',
    })
    if (!bank.length) panel.textContent = 'No recordings yet. Press Record, draw, then Stop.'
    bank.forEach((events, i) => {
      const row = document.createElement('div')
      Object.assign(row.style, { display: 'flex', gap: '10px', alignItems: 'center', padding: '6px' })
      const when = recordedAt[i] ? new Date(recordedAt[i]) : null
      const seconds = (events[events.length - 1][1] / 1000).toFixed(1)
      const strokeCount = events.filter((e) => e[0] === DOWN).length
      const info = document.createElement('div')
      info.style.flex = '1'
      info.innerHTML = `<b>#${i + 1}</b>${lastPlayed === i ? ' · last played' : ''}<br>${
        when ? `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<br>` : ''
      }${seconds}s · ${strokeCount} stroke${strokeCount === 1 ? '' : 's'}`
      const actions = document.createElement('div')
      Object.assign(actions.style, { display: 'flex', flexDirection: 'column', gap: '4px' })
      const action = (label, title, fn, danger) => {
        const b = document.createElement('button')
        b.textContent = label
        b.title = title
        Object.assign(b.style, {
          font: 'inherit',
          padding: '4px 10px',
          borderRadius: '999px',
          cursor: 'pointer',
          border: `1px solid ${danger ? 'rgba(200, 20, 60, 0.5)' : 'rgba(0, 0, 0, 0.2)'}`,
          color: danger ? 'rgb(200, 20, 60)' : '#333',
          background: 'white',
        })
        b.addEventListener('click', fn)
        actions.appendChild(b)
      }
      action('▶ Play', 'Replay this recording now', () => {
        playNow(i)
        closePanel()
      })
      action('✕ Delete', 'Remove this recording from the bank', () => {
        if (!confirm(`Delete recording #${i + 1}? This removes it from src/assets/intro-path.json.`)) return
        const q = new URLSearchParams({ index: String(i) })
        if (recordedAt[i]) q.set('recordedAt', recordedAt[i])
        fetch(`/__intro-path?${q}`, { method: 'DELETE' })
          .then((r) => {
            if (!r.ok) throw new Error(r.statusText)
            // Forget it here too; the page also reloads with the updated file.
            bank.splice(i, 1)
            recordedAt.splice(i, 1)
            if (replay?.events === events) {
              if (replay.held) up()
              replay = null
            }
            lastPlayed = -1
            listButton.textContent = `☰ Recordings (${bank.length})`
            setButton(!!rec)
            openPanel()
          })
          .catch((err) => alert(`Could not delete the recording: ${err.message}`))
      }, true)
      row.innerHTML = preview(events)
      row.append(info, actions)
      if (i) row.style.borderTop = '1px solid #eee'
      panel.appendChild(row)
    })
    container.appendChild(panel)
  }

  // Client position ↔ position relative to the centre, in shorter-side units.
  const toPath = (clientX, clientY) => {
    const r = element.getBoundingClientRect()
    const m = Math.min(r.width, r.height)
    return [(clientX - r.left - r.width / 2) / m, (clientY - r.top - r.height / 2) / m]
  }
  const fromPath = (x, y) => {
    const r = element.getBoundingClientRect()
    const m = Math.min(r.width, r.height)
    return [r.left + r.width / 2 + x * m, r.top + r.height / 2 + y * m]
  }

  const log = (type, e) => {
    if (rec.start === null) {
      if (type !== DOWN) return
      rec.start = e.timeStamp
    }
    // A release away from a drawing press (e.g. clicking Stop) isn't part of it.
    if (type === UP && !rec.held) return
    const t = e.timeStamp - rec.start
    if (t > RECORD_MAX * 1000) return
    const [x, y] = type === UP ? [0, 0] : toPath(e.clientX, e.clientY)
    rec.events.push([type, Math.round(t), Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4])
    if (type === DOWN) rec.held = true
    if (type === UP) rec.held = false
  }

  const save = () => {
    // Keep up to the last pen lift.
    let end = rec.events.length
    while (end && rec.events[end - 1][0] !== UP) end--
    const events = rec.events.slice(0, end)
    rec = null
    setButton(false)
    if (!events.length) {
      console.info('Nothing was drawn, so nothing was added to the intro bank.')
      return
    }
    // The dev server adds it to the bank file; the page then reloads with it.
    fetch('/__intro-path', { method: 'POST', body: JSON.stringify({ events }) })
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText)
        console.info(`Added a recording to the intro bank (${events.length} events).`)
      })
      .catch((err) => console.warn('Could not save the recording:', err))
  }

  // Starts recording i now, in place of any replay in progress.
  const playNow = (i) => {
    if (replay?.held) up()
    lastPlayed = i
    replay = { events: bank[i], i: 0, start: performance.now(), held: false }
  }

  // A random recording, not the one just played when there's a choice.
  const pick = () => {
    let i = Math.floor(Math.random() * bank.length)
    if (bank.length > 1 && i === lastPlayed) i = (i + 1 + Math.floor(Math.random() * (bank.length - 1))) % bank.length
    lastPlayed = i
    return bank[i]
  }

  return {
    // Wraps a DOM pointer listener so it's logged while recording. Live input
    // always goes through, replay or not.
    listen(kind, fn) {
      return (e) => {
        if (rec) {
          if (kind === 'down') log(DOWN, e)
          else if (kind === 'up') log(UP, e)
          else if (kind === 'move') for (const ev of e.getCoalescedEvents?.() ?? [e]) log(MOVE, ev)
        }
        fn(e)
      }
    },

    // Per frame. embossed: whether the logo has finished embossing; since:
    // seconds since it did.
    update(embossed, since) {
      if (!bank.length || !embossed) return
      const now = performance.now()
      if (!replay) {
        if (nextAt === null) {
          if (since < REPLAY_DELAY) return
          nextAt = now
        }
        if (now < nextAt) return
        replay = { events: pick(), i: 0, start: now, held: false }
      }
      const t = now - replay.start
      const events = replay.events
      while (replay.i < events.length && events[replay.i][1] <= t) {
        const [type, et, x, y] = events[replay.i++]
        const [clientX, clientY] = fromPath(x, y)
        const e = { clientX, clientY, timeStamp: replay.start + et }
        if (type === DOWN) {
          replay.held = true
          down(e)
        } else if (type === MOVE) move(e)
        else {
          replay.held = false
          up(e)
        }
      }
      if (replay.i >= events.length) {
        if (replay.held) up()
        replay = null
        nextAt = now + REPLAY_GAP * 1000
      }
    },

    dispose() {
      button?.remove()
      listButton?.remove()
      closePanel()
    },
  }
}
