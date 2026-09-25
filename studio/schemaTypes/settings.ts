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
  ],
  preview: {prepare: () => ({title: 'Settings'})},
})
