import {createClient} from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'

export const client = createClient({
  projectId: 'yb2dhf8w',
  dataset: 'production',
  apiVersion: '2025-01-01',
  useCdn: false, // build-time fetch, so always get fresh data
})

const builder = imageUrlBuilder(client)
export const urlFor = (src) => builder.image(src)

export const getPosts = () =>
  client.fetch(`*[_type == "post" && defined(slug.current)] | order(publishedAt desc){
    title, "slug": slug.current, author, publishedAt, excerpt, coverImage
  }`)

export const getPost = (slug) =>
  client.fetch(`*[_type == "post" && slug.current == $slug][0]`, {slug})