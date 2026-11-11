// The site's addresses. Each view has a path under the site's base: "" for the
// plain sheet, "artists", "artists/<slug>", "gallery", "happenings", "info"
// and "contact". Going between them changes the address without reloading the
// page (the history API), and the browser's back and forward buttons work.
// GitHub Pages only serves files that exist, so the build also writes a page
// at each fixed path and a 404.html copy of the app for artists' pages (see
// vite.config.js).

// "/" while developing, "/life-is-beautiful/" on GitHub Pages.
const BASE = import.meta.env.BASE_URL

// The path after the base, without slashes at either end.
export const currentPath = () => {
  let path = window.location.pathname
  if (path.startsWith(BASE)) path = path.slice(BASE.length)
  else if (`${path}/` === BASE) path = ''
  return path.replace(/^\/+|\/+$/g, '')
}

// The address of a path, for a link's href.
export const href = (path) => BASE + path

// Goes to a path (a new step in the history), and tells the page.
export const navigate = (path) => {
  const url = BASE + path
  if (url === window.location.pathname) return
  history.pushState(null, '', url + window.location.search)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// Follows a link's click in place, unless it's meant for a new tab or window
// (a middle click, or with a modifier key held).
export const followLink = (e, path) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  navigate(path)
}

// An old link with a hash ("#artists/aloisius") is moved to its path, so
// anything shared before keeps working.
export const upgradeHashLink = () => {
  const old = window.location.hash.replace(/^#\/?/, '')
  if (old) history.replaceState(null, '', BASE + old + window.location.search)
}
