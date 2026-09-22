import { generatePaperTextures } from './paperTextures.js'

// Builds the paper textures off the main thread so the page stays smooth.
// Messages in:  { type: 'logo', bitmap }  once, then
//               { type: 'generate', id, w, h, px, settings }
// Message out:  { id, w, h, color, surface, logo } (buffers transferred)
let logo = null

self.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'logo') {
    logo = msg.bitmap
    return
  }
  if (msg.type === 'generate' && logo) {
    const { id, w, h, px, settings } = msg
    const out = generatePaperTextures(logo, w, h, px, settings)
    self.postMessage({ id, w, h, ...out }, [out.color.buffer, out.surface.buffer, out.logo.buffer])
  }
}
