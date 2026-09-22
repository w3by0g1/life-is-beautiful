import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// While developing, lets the page add a recorded drawing to the intro bank in
// the project (src/assets/intro-path.json), so it replays and ships with the
// site (POST), or remove one (DELETE ?index=n, with &recordedAt= to make sure
// it's the one that was shown).
function introPathSaver() {
  return {
    name: 'intro-path-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__intro-path', (req, res) => {
        const file = path.resolve('src/assets/intro-path.json')
        if (req.method === 'DELETE') {
          try {
            const query = new URL(req.url, 'http://x').searchParams
            const index = Number(query.get('index'))
            const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
            const recordings = saved?.recordings ?? []
            const target = recordings[index]
            if (!target || (query.has('recordedAt') && target.recordedAt !== query.get('recordedAt'))) {
              throw new Error('No such recording')
            }
            recordings.splice(index, 1)
            fs.writeFileSync(file, JSON.stringify({ version: 2, recordings }))
            res.end(String(recordings.length))
          } catch (err) {
            res.statusCode = 400
            res.end(String(err))
          }
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
          if (body.length > 5e6) req.destroy()
        })
        req.on('end', () => {
          try {
            const { events } = JSON.parse(body)
            if (!Array.isArray(events) || !events.length) throw new Error('Not a recording')
            let saved = null
            try {
              saved = JSON.parse(fs.readFileSync(file, 'utf8'))
            } catch {
              saved = null
            }
            // Earlier files held a single recording; keep it as the first in the bank.
            const recordings = saved?.recordings ?? (saved?.events ? [{ events: saved.events }] : [])
            recordings.push({ recordedAt: new Date().toISOString(), events })
            fs.writeFileSync(file, JSON.stringify({ version: 2, recordings }))
            res.end(String(recordings.length))
          } catch (err) {
            res.statusCode = 400
            res.end(String(err))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
// `npm run dev:phone` serves over https on the local network (with a
// self-signed certificate), which phones need before they'll share their tilt.
export default defineConfig(({ mode }) => ({
  // Relative asset paths, so the built site works from any folder (e.g.
  // GitHub Pages serves it under /<repo>/).
  base: './',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    introPathSaver(),
    mode === 'phone' && basicSsl(),
  ],
  server: mode === 'phone' ? { host: true } : undefined,
}))
