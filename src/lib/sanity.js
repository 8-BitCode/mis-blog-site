import {createClient} from '@sanity/client'
import * as imageUrl from '@sanity/image-url'

// Newer versions export `createImageUrlBuilder` and deprecate the default export.
const imageUrlBuilder = imageUrl.createImageUrlBuilder ?? imageUrl.default

export const client = createClient({
  projectId: 'yb2dhf8w',
  dataset: 'production',
  apiVersion: '2025-01-01',
  useCdn: false, // build-time fetch, so always get fresh data
})

const builder = imageUrlBuilder(client)
export const urlFor = (src) => builder.image(src)

/**
 * Responsive, compressed image URLs. Sanity resizes and re-encodes on its CDN,
 * so a phone photo uploaded at 8 MB is served at a few hundred KB. This is what
 * keeps bandwidth (the one free-tier limit worth watching) under control.
 */
export function imgSet(src, widths = [480, 800, 1200], {ratio} = {}) {
  const make = (w) => {
    let b = urlFor(src).width(w).auto('format').quality(72)
    if (ratio) b = b.height(Math.round(w / ratio)).fit('crop')
    return b.url()
  }
  return {
    src: make(widths[Math.floor(widths.length / 2)]),
    srcset: widths.map((w) => `${make(w)} ${w}w`).join(', '),
  }
}

const LIST_FIELDS = `
  title, "slug": slug.current, author, publishedAt, excerpt,
  coverImage,
  "lqip": coverImage.asset->metadata.lqip,
  "chars": coalesce(length(pt::text(body)), 0)
`

// File numbers are counted oldest → newest, so FILE 001 is always the first post.
const number = (posts) =>
  posts.map((p, i) => ({...p, fileNo: String(posts.length - i).padStart(3, '0')}))

/** Lightweight list for the homepage, ticker and 404 suggestions. */
export async function getPosts() {
  const posts = await client.fetch(
    `*[_type == "post" && defined(slug.current)] | order(publishedAt desc){${LIST_FIELDS}}`,
  )
  return number(posts)
}

/** Everything, including bodies, in ONE request. Used to build the post pages. */
export async function getPostsFull() {
  const posts = await client.fetch(
    `*[_type == "post" && defined(slug.current)] | order(publishedAt desc){${LIST_FIELDS}, body}`,
  )
  return number(posts)
}
