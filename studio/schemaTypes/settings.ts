import {defineField, defineType} from 'sanity'

// Settings for the sheet itself. There's just one.
export const settings = defineType({
  name: 'settings',
  title: 'Settings',
  type: 'document',
  fields: [
    defineField({
      name: 'strokeMinutes',
      title: 'How long drawings stay (minutes)',
      description:
        'Each stroke stays this long from when it was drawn, then fades away over a few seconds. It applies to everyone on the site, from their next visit.',
      type: 'number',
      initialValue: 2,
      validation: (rule) => rule.required().min(0.1).max(60),
    }),
    defineField({
      name: 'headerDrawing',
      title: 'Header: show a drawing',
      description:
        'On: the site’s name at the top left is one of the recorded drawings, written out in calligraphy. Off: it’s the name in text.',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {prepare: () => ({title: 'Settings'})},
})
