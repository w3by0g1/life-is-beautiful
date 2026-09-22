import {defineArrayMember, defineField, defineType} from 'sanity'

// Rich text for descriptions: paragraphs with bold and italic, and links.
export const richText = defineType({
  name: 'richText',
  title: 'Rich text',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [{title: 'Normal', value: 'normal'}],
      lists: [],
      marks: {
        decorators: [
          {title: 'Bold', value: 'strong'},
          {title: 'Italic', value: 'em'},
        ],
        annotations: [
          defineArrayMember({
            name: 'link',
            title: 'Link',
            type: 'object',
            fields: [defineField({name: 'href', title: 'URL', type: 'url'})],
          }),
        ],
      },
    }),
  ],
})

const artwork = (title: string) =>
  defineField({
    name: 'artwork',
    title,
    type: 'image',
    options: {hotspot: true},
    fields: [defineField({name: 'alt', title: 'Alternative text', type: 'string'})],
    validation: (rule) => rule.required(),
  })

const title = defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()})
const description = defineField({name: 'description', title: 'Description', type: 'richText'})
const date = defineField({name: 'date', title: 'Release date', type: 'date'})
const link = defineField({
  name: 'link',
  title: 'Link',
  type: 'url',
  description: 'Where "Listen" goes (Bandcamp, Spotify, …).',
  validation: (rule) => rule.uri({scheme: ['http', 'https']}),
})

const releasePreview = (kind: string) => ({
  select: {title: 'title', date: 'date', media: 'artwork'},
  prepare: ({title, date, media}: {title?: string; date?: string; media?: unknown}) => ({
    title: title || `Untitled ${kind.toLowerCase()}`,
    subtitle: [kind, date].filter(Boolean).join(' · '),
    media: media as never,
  }),
})

export const album = defineType({
  name: 'album',
  title: 'Album',
  type: 'object',
  fields: [
    artwork('Album artwork'),
    title,
    date,
    description,
    defineField({
      name: 'tracklist',
      title: 'Tracklist',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'track',
          fields: [
            defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
            defineField({
              name: 'credit',
              title: 'Artist credit',
              type: 'string',
              description: 'e.g. "aloisius ft. Bianca Scout". Leave empty to use the artist\'s name.',
            }),
          ],
          preview: {select: {title: 'title', subtitle: 'credit'}},
        }),
      ],
    }),
    link,
  ],
  preview: releasePreview('Album'),
})

export const single = defineType({
  name: 'single',
  title: 'Single',
  type: 'object',
  fields: [artwork('Single artwork'), title, date, description, link],
  preview: releasePreview('Single'),
})

// Where a lone image or video sits across the column.
export const MEDIA_ALIGNMENTS = [
  {title: 'Left', value: 'left'},
  {title: 'Between left and centre', value: 'leftCenter'},
  {title: 'Centre', value: 'center'},
  {title: 'Between centre and right', value: 'rightCenter'},
  {title: 'Right', value: 'right'},
]

export const media = defineType({
  name: 'media',
  title: 'Media',
  type: 'object',
  fields: [
    defineField({
      name: 'layout',
      title: 'Layout',
      type: 'string',
      options: {
        list: [
          {title: 'Single', value: 'single'},
          {title: 'Double (side by side)', value: 'double'},
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      initialValue: 'single',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'alignment',
      title: 'Alignment',
      type: 'string',
      options: {list: MEDIA_ALIGNMENTS, layout: 'radio'},
      initialValue: 'center',
      hidden: ({parent}) => parent?.layout !== 'single',
    }),
    defineField({
      name: 'items',
      title: 'Images and videos',
      description: 'One for a single layout, two for a double.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'image',
          name: 'image',
          title: 'Image',
          options: {hotspot: true},
          fields: [defineField({name: 'alt', title: 'Alternative text', type: 'string'})],
        }),
        defineArrayMember({
          type: 'file',
          name: 'video',
          title: 'Video',
          options: {accept: 'video/*'},
          fields: [
            defineField({
              name: 'poster',
              title: 'Poster image',
              type: 'image',
              description: 'Shown before the video plays.',
            }),
          ],
        }),
      ],
      validation: (rule) =>
        rule.custom((items, context) => {
          const layout = (context.parent as {layout?: string} | undefined)?.layout
          const n = Array.isArray(items) ? items.length : 0
          if (layout === 'double' && n !== 2) return 'A double layout needs exactly two images or videos.'
          if (layout !== 'double' && n !== 1) return 'A single layout needs exactly one image or video.'
          return true
        }),
    }),
  ],
  preview: {
    select: {layout: 'layout', alignment: 'alignment', first: 'items.0', second: 'items.1'},
    prepare: ({layout, alignment, first}: {layout?: string; alignment?: string; first?: {_type?: string}}) => ({
      title: layout === 'double' ? 'Media · double' : 'Media · single',
      subtitle:
        layout === 'double'
          ? undefined
          : MEDIA_ALIGNMENTS.find((a) => a.value === alignment)?.title,
      media: first?._type === 'image' ? (first as never) : undefined,
    }),
  },
})
