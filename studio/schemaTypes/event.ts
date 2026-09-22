import {defineArrayMember, defineField, defineType} from 'sanity'

// A happening: shown on the site's calendar (#happenings) on its date, by its
// poster, with its details beside the calendar when chosen.
export const event = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'e.g. "life is beautiful presents: libiversary festival".',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date',
      options: {dateFormat: 'ddd D MMM YYYY'},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'time', title: 'Time', type: 'string', description: 'Optional, e.g. "7:30pm".'}),
    defineField({name: 'venue', title: 'Venue', type: 'string', description: 'e.g. "EartH Theatre".'}),
    defineField({
      name: 'poster',
      title: 'Poster',
      type: 'image',
      options: {hotspot: true},
      fields: [defineField({name: 'alt', title: 'Alternative text', type: 'string'})],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'lineup',
      title: 'Lineup',
      description: 'Shown as "alongside …". Pick an artist from the roster (links to their page), or type a name.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'lineupEntry',
          title: 'Performer',
          fields: [
            defineField({name: 'artist', title: 'Artist (from the roster)', type: 'reference', to: [{type: 'artist'}]}),
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              description: 'For someone not on the roster.',
              hidden: ({parent}) => Boolean(parent?.artist),
            }),
            defineField({
              name: 'url',
              title: 'Link',
              type: 'url',
              description: 'Optional, for someone not on the roster.',
              hidden: ({parent}) => Boolean(parent?.artist),
            }),
          ],
          validation: (rule) =>
            rule.custom((value: {artist?: unknown; name?: string} | undefined) =>
              value?.artist || value?.name ? true : 'Pick an artist or type a name.',
            ),
          preview: {
            select: {artistName: 'artist.name', name: 'name', media: 'artist.artwork'},
            prepare: ({artistName, name, media}) => ({
              title: artistName || name || 'Performer',
              subtitle: artistName ? 'On the roster' : undefined,
              media,
            }),
          },
        }),
      ],
    }),
    defineField({name: 'description', title: 'Description', type: 'richText'}),
    defineField({
      name: 'ticketUrl',
      title: 'Tickets link',
      type: 'url',
      description: 'Where "get tickets" goes.',
      validation: (rule) => rule.uri({scheme: ['http', 'https']}),
    }),
  ],
  orderings: [
    {title: 'Date (newest first)', name: 'dateDesc', by: [{field: 'date', direction: 'desc'}]},
    {title: 'Date (oldest first)', name: 'dateAsc', by: [{field: 'date', direction: 'asc'}]},
  ],
  preview: {
    select: {title: 'title', date: 'date', venue: 'venue', media: 'poster'},
    prepare: ({title, date, venue, media}) => ({title, subtitle: [date, venue].filter(Boolean).join(' · '), media}),
  },
})
