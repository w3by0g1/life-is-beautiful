// Live, shared drawing. Every visitor's strokes are sent through a Firebase
// Realtime Database (project "life is beautiful live sketch") as they're
// drawn, and replayed on everyone else's sheet a moment later, each visitor
// on their own pen. Someone arriving sees every stroke from the last
// STROKE_LIFETIME, fading out when it would have anyway. Strokes older than
// that are deleted by whichever visitor notices them. The database rules are
// in firebase/database.rules.json.
//
// Positions are stored like the intro recordings: relative to the logo's
// centre (so they follow the sheet when the view is panned), in units of the
// screen's shorter side, so a stroke lands in the same place on the sheet on
// any screen.

import { INK_FADE, INK_LIFESPAN } from './ink.js'

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBlfFi8xlDdOL1YsYiXcCj7CNLEiOk8h60',
  authDomain: 'life-is-beautiful-sketches.firebaseapp.com',
  databaseURL: 'https://life-is-beautiful-sketches-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'life-is-beautiful-sketches',
  appId: '1:974924637711:web:9cb1db9b7a6453e098e57a',
}

// How long a stroke lasts (ms), matching the ink's lifespan and fade.
const STROKE_LIFETIME = (INK_LIFESPAN + INK_FADE) * 1000
// How often (ms) a stroke being drawn sends its new points.
const SEND_EVERY = 50
// How far behind (ms) other people's live strokes are replayed, so batches
// arriving unevenly still play back smoothly.
const PLAY_DELAY = 180
// A stroke started longer ago than this (ms) when it arrives is drawn at once
// rather than replayed live.
const LIVE_WINDOW = 20000
// A live stroke that gets no new points for this long (ms) is finished off
// (its sender may have closed the page mid-stroke).
const STALL_TIMEOUT = 8000

const DOWN = 0
const MOVE = 1

// element: the canvas (for positions); offset: how far (CSS px) the sheet is
// panned right; pen: draws other people's strokes, as begin(id, clientX,
// clientY, timeStamp, ageSeconds), move(id, clientX, clientY, timeStamp) and
// end(id); onClear: wipes the sheet (when it's cleared for everyone).
export function createLiveSketch({ element, offset, pen, onClear }) {
  const clientId = Math.random().toString(36).slice(2, 12)
  let fb = null
  let db = null
  let serverOffset = 0
  // When the sheet was last cleared for everyone (server ms); strokes from
  // before then aren't drawn.
  let clearedAt = 0
  let disposed = false
  const unsubscribes = []

  const toPath = (clientX, clientY) => {
    const r = element.getBoundingClientRect()
    const m = Math.min(r.width, r.height)
    return [(clientX - r.left - r.width / 2 - offset()) / m, (clientY - r.top - r.height / 2) / m]
  }
  const fromPath = (x, y) => {
    const r = element.getBoundingClientRect()
    const m = Math.min(r.width, r.height)
    return [r.left + r.width / 2 + offset() + x * m, r.top + r.height / 2 + y * m]
  }
  const serverNow = () => Date.now() + serverOffset

  // Points travel as "x,y,ms;x,y,ms;…" (ms since the stroke began).
  const encode = (points) => points.map(([x, y, t]) => `${x.toFixed(4)},${y.toFixed(4)},${Math.round(t)}`).join(';')
  const decode = (text) =>
    text
      .split(';')
      .filter(Boolean)
      .map((p) => p.split(',').map(Number))

  // --- Sending the user's own strokes ------------------------------------

  let mine = null
  const sendPending = () => {
    if (!mine || !mine.ref || !mine.pending.length) return
    const batch = encode(mine.pending)
    mine.pending = []
    const key = `b${String(mine.batches++).padStart(4, '0')}`
    fb.set(fb.child(mine.ref, `p/${key}`), batch).catch(() => {})
  }
  const record = (type, e) => {
    if (!db) return
    if (type === DOWN) {
      finish()
      const ref = fb.push(fb.ref(db, 'strokes'))
      mine = { ref, start: e.timeStamp, pending: [], batches: 0, timer: null }
      fb.set(ref, { t: fb.serverTimestamp(), u: clientId }).catch(() => {})
      mine.timer = setInterval(sendPending, SEND_EVERY)
    }
    if (!mine) return
    const [x, y] = toPath(e.clientX, e.clientY)
    mine.pending.push([x, y, e.timeStamp - mine.start])
  }
  const finish = () => {
    if (!mine) return
    clearInterval(mine.timer)
    sendPending()
    if (mine.ref) fb.update(mine.ref, { e: true }).catch(() => {})
    mine = null
  }

  // --- Replaying everyone else's -------------------------------------------

  // Strokes seen (by id), and the ones being replayed live, oldest first. Each
  // visitor draws with their own pen, so their strokes play one after another.
  const seen = new Map()
  let playing = []

  // Draws a finished (or old) stroke at once, as old as it really is.
  const drawWhole = (points, ageSeconds) => {
    if (!points.length) return
    const base = performance.now() - points[points.length - 1][2]
    points.forEach(([x, y, t], i) => {
      const [cx, cy] = fromPath(x, y)
      if (i === 0) pen.begin('history', cx, cy, base + t, ageSeconds)
      else pen.move('history', cx, cy, base + t)
    })
    pen.end('history')
  }

  const batchesOf = (data) =>
    Object.keys(data?.p ?? {})
      .sort()
      .map((k) => [k, data.p[k]])

  const onStroke = (snap) => {
    const id = snap.key
    const data = snap.val()
    if (!data || data.u === clientId || seen.has(id) || data.t < clearedAt) return
    const age = serverNow() - data.t
    if (age > STROKE_LIFETIME) {
      seen.set(id, true)
      fb.remove(snap.ref).catch(() => {})
      return
    }
    seen.set(id, true)
    if (data.e || age > LIVE_WINDOW) {
      drawWhole(batchesOf(data).flatMap(([, b]) => decode(b)), age / 1000)
      return
    }
    // Live: queue its points as they arrive and play them PLAY_DELAY behind.
    const penId = `live:${data.u}`
    const s = { penId, points: [], next: 0, started: false, ended: false, done: false, start: 0, keys: new Set(), lastAdd: performance.now() }
    playing.push(s)
    const addBatch = (key, text) => {
      if (s.keys.has(key)) return
      s.keys.add(key)
      s.lastAdd = performance.now()
      s.points.push(...decode(text))
      s.points.sort((a, b) => a[2] - b[2])
    }
    for (const [k, b] of batchesOf(data)) addBatch(k, b)
    const off1 = fb.onChildAdded(fb.child(snap.ref, 'p'), (b) => addBatch(b.key, b.val()))
    const off2 = fb.onValue(fb.child(snap.ref, 'e'), (e) => {
      if (e.val()) s.ended = true
    })
    s.stop = () => {
      off1()
      off2()
    }
  }

  // Per frame: plays queued live points that are due.
  const update = () => {
    const now = performance.now()
    const busy = new Set()
    for (const s of playing) {
      const { penId } = s
      if (!s.ended && now - s.lastAdd > STALL_TIMEOUT) s.ended = true
      if (!s.started && s.ended && !s.points.length) {
        s.stop?.()
        s.done = true
        continue
      }
      if (!s.started) {
        // A visitor's next stroke waits for their last to finish playing.
        if (!s.points.length || busy.has(penId)) {
          busy.add(penId)
          continue
        }
        s.start = now + PLAY_DELAY
        s.started = true
      }
      busy.add(penId)
      while (s.next < s.points.length && s.start + s.points[s.next][2] <= now) {
        const [x, y, t] = s.points[s.next]
        const [cx, cy] = fromPath(x, y)
        if (s.next === 0) pen.begin(penId, cx, cy, s.start + t, 0)
        else pen.move(penId, cx, cy, s.start + t)
        s.next++
      }
      if (s.ended && s.next >= s.points.length) {
        pen.end(penId)
        s.stop?.()
        s.done = true
        busy.delete(penId)
      }
    }
    if (playing.some((s) => s.done)) playing = playing.filter((s) => !s.done)
  }

  // Removes strokes past their lifetime (any visitor may, once they're that
  // old), so the database only ever holds the last few minutes.
  const tidy = () => {
    if (!db) return
    const old = fb.query(fb.ref(db, 'strokes'), fb.orderByChild('t'), fb.endAt(serverNow() - STROKE_LIFETIME - 5000), fb.limitToFirst(50))
    fb.get(old)
      .then((snap) => snap.forEach((s) => void fb.remove(s.ref).catch(() => {})))
      .catch(() => {})
  }

  // Connect after the page has started, so the page isn't held up.
  Promise.all([import('firebase/app'), import('firebase/database')])
    .then(([app, database]) => {
      if (disposed) return
      fb = database
      db = database.getDatabase(app.initializeApp(FIREBASE_CONFIG, 'live-sketch'))
      unsubscribes.push(
        fb.onValue(fb.ref(db, '.info/serverTimeOffset'), (s) => {
          serverOffset = s.val() ?? 0
        }),
      )
      // Clearing: the first value is when it was last cleared; any change
      // after that wipes this page's sheet too.
      let firstClear = true
      unsubscribes.push(
        fb.onValue(fb.ref(db, 'clearedAt'), (s) => {
          const at = s.val() ?? 0
          if (!firstClear && at > clearedAt) {
            finish()
            for (const p of playing) p.stop?.()
            playing = []
            onClear?.()
          }
          firstClear = false
          clearedAt = at
        }),
      )
      // Everything from the last STROKE_LIFETIME, then new strokes as they come.
      const recent = fb.query(fb.ref(db, 'strokes'), fb.orderByChild('t'), fb.startAt(serverNow() - STROKE_LIFETIME))
      unsubscribes.push(fb.onChildAdded(recent, onStroke))
      tidy()
      const tidyTimer = setInterval(tidy, 60000)
      unsubscribes.push(() => clearInterval(tidyTimer))
    })
    .catch((err) => console.warn('Live drawing is unavailable:', err))

  return {
    // Wraps a DOM pointer listener so the user's own strokes are sent.
    listen(kind, fn) {
      return (e) => {
        if (kind === 'down') record(DOWN, e)
        else if (kind === 'move' && mine) {
          const samples = e.getCoalescedEvents?.()
          for (const ev of samples?.length ? samples : [e]) record(MOVE, ev)
        } else if (kind === 'up' || kind === 'leave') finish()
        fn(e)
      }
    },
    update,
    dispose() {
      disposed = true
      finish()
      for (const s of playing) s.stop?.()
      for (const off of unsubscribes) off()
    },
  }
}
