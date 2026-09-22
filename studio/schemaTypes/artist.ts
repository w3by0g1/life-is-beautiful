import {defineArrayMember, defineField, defineType} from 'sanity'

// An artist: shown in the site's artists list (beside the embossed logo), with
// their own page of albums, singles and media.
export const artist = defineType({
  name: 'artist',
  title: 'Artist',
  type: 'document',
  groups: [
    {name: 'profile', title: 'Profile', default: true},
    {name: 'content', title: 'Albums, singles & media'},
  ],
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'As it appears in the list, with its capitals (e.g. "THE NARRATOR").',
      group: 'profile',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'name', maxLength: 96},
      group: 'profile',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'sortOrder',
      title: 'Position in the list',
      type: 'number',
      description: 'Lower numbers come first.',
      group: 'profile',
      initialValue: 100,
    }),
    defineField({
      name: 'artwork',
      title: 'Artwork',
      type: 'image',
      options: {hotspot: true},
      group: 'profile',
      fields: [defineField({name: 'alt', title: 'Alternative text', type: 'string'})],
    }),
    defineField({name: 'description', title: 'Description', type: 'richText', group: 'profile'}),
    defineField({
      name: 'bandcamp',
      title: 'Bandcamp link',
      type: 'url',
      group: 'profile',
      validation: (rule) => rule.uri({scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'instagram',
      title: 'Instagram link',
      type: 'url',
      group: 'profile',
      validation: (rule) => rule.uri({scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'content',
      title: 'Albums, singles & media',
      description: 'Shown on the artist\'s page in this order; drag to rearrange.',
      type: 'array',
      group: 'content',
      of: [
        defineArrayMember({type: 'album'}),
        defineArrayMember({type: 'single'}),
        defineArrayMember({type: 'media'}),
      ],
    }),
  ],
  orderings: [
    {title: 'List order', name: 'listOrder', by: [{field: 'sortOrder', direction: 'asc'}, {field: 'name', direction: 'asc'}]},
    {title: 'Name', name: 'nameAsc', by: [{field: 'name', direction: 'asc'}]},
  ],
  preview: {
    select: {title: 'name', order: 'sortOrder', media: 'artwork'},
    prepare: ({title, order, media}) => ({title, subtitle: order != null ? `#${order}` : undefined, media}),
  },
})
