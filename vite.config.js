import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
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

// While developing, clears the shared live drawing for everyone (POST
// /__clear-sketches): deletes every stroke and stamps clearedAt, which every
// open page watches. Uses the Firebase CLI's login, which the public rules
// don't allow anyone else.
function sketchClearer() {
  return {
    name: 'sketch-clearer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__clear-sketches', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const data = JSON.stringify({ strokes: null, clearedAt: { '.sv': 'timestamp' } })
        execFile(
          'firebase',
          ['database:update', '/', '--data', data, '--force', '--project', 'life-is-beautiful-sketches'],
          { timeout: 60000 },
          (err, stdout, stderr) => {
            if (err) {
              res.statusCode = 500
              res.end(String(stderr || err.message))
            } else res.end('ok')
          },
        )
      })
    },
  }
}

// The site's addresses are paths ("/artists", "/artists/aloisius"; see
// src/route.js), but GitHub Pages only serves files that exist. So the built
// page is also written at each fixed path, and as 404.html, which GitHub Pages
// serves for any other (an artist's page), where the app reads the address
// and shows it.
const PAGES = ['artists', 'gallery', 'happenings', 'info', 'contact']
function pagesForPaths() {
  let outDir = 'dist'
  return {
    name: 'pages-for-paths',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const page = fs.readFileSync(path.join(outDir, 'index.html'))
      fs.writeFileSync(path.join(outDir, '404.html'), page)
      for (const name of PAGES) {
        fs.mkdirSync(path.join(outDir, name), { recursive: true })
        fs.writeFileSync(path.join(outDir, name, 'index.html'), page)
      }
    },
  }
}

// https://vite.dev/config/
// `npm run dev:phone` serves over https on the local network (with a
// self-signed certificate), which phones need before they'll share their tilt.
export default defineConfig(({ command, mode }) => ({
  // Absolute asset paths, so they load from any address (relative ones would
  // be looked for under /artists/ on an artist's page). GitHub Pages serves the
  // site under /<repo>/; on its own domain this would be '/'.
  base: command === 'build' ? '/life-is-beautiful/' : '/',
  plugins: [
    react(),
    pagesForPaths(),
    babel({ presets: [reactCompilerPreset()] }),
    introPathSaver(),
    sketchClearer(),
    mode === 'phone' && basicSsl(),
  ],
  server: mode === 'phone' ? { host: true } : undefined,
}))
