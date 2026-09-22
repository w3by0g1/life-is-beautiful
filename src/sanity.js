// Content from the site's Sanity project (the studio is in studio/): read
// over Sanity's public CDN API, so no key is needed in the page.
export const SANITY_PROJECT_ID = '3x555lnx'
export const SANITY_DATASET = 'production'
const API_VERSION = '2025-02-19'

// Runs a GROQ query (with $params) and returns its result.
export async function sanityQuery(query, params = {}) {
  const search = new URLSearchParams({ query })
  for (const [k, v] of Object.entries(params)) search.set(`$${k}`, JSON.stringify(v))
  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${API_VERSION}/data/query/${SANITY_DATASET}?${search}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sanity query failed (${res.status})`)
  return (await res.json()).result
}

// The artists list, in the order set in the studio.
export const fetchArtists = () =>
  sanityQuery(`*[_type == "artist" && defined(name)] | order(sortOrder asc, name asc) { name, "slug": slug.current }`)

// One artist's page: profile, and their albums, singles and media in order.
export const fetchArtist = (slug) =>
  sanityQuery(
    `*[_type == "artist" && slug.current == $slug][0] {
      name, "slug": slug.current, description, bandcamp, instagram,
      artwork { alt, "url": asset->url },
      content[] {
        _type, _key, title, date, description, link, layout, alignment,
        artwork { alt, "url": asset->url },
        tracklist[] { _key, title, credit },
        items[] { _type, _key, alt, "url": asset->url, "poster": poster.asset->url }
      }
    }`,
    { slug },
  )

// A Sanity image URL resized for display (w CSS px, at up to 2x density).
export const imageUrl = (url, w) => (url ? `${url}?w=${Math.round(w * 2)}&fit=max&auto=format` : undefined)

// Every event (for the happenings calendar), oldest first.
export const fetchEvents = () =>
  sanityQuery(
    `*[_type == "event" && defined(date)] | order(date asc) {
      _id, title, date, time, venue, description, ticketUrl,
      poster { alt, "url": asset->url },
      lineup[] { _key, name, url, "artist": artist->{ name, "slug": slug.current } }
    }`,
  )

// The info text (#info).
export const fetchInfo = () => sanityQuery(`*[_id == "info"][0].text`)
