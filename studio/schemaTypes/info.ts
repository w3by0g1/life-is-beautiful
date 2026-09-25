import {defineField, defineType} from 'sanity'

// The site's info text (#info), shown beside the logo. There's just one.
export const info = defineType({
  name: 'info',
  title: 'Info',
  type: 'document',
  fields: [
    defineField({name: 'text', title: 'Text', type: 'richText'}),
    defineField({
      name: 'bandcamp',
      title: 'Bandcamp link',
      description: 'Shown as a mark under the text.',
      type: 'url',
      validation: (rule) => rule.uri({scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'instagram',
      title: 'Instagram link',
      description: 'Shown as a mark under the text.',
      type: 'url',
      validation: (rule) => rule.uri({scheme: ['http', 'https']}),
    }),
  ],
  preview: {prepare: () => ({title: 'Info'})},
})
