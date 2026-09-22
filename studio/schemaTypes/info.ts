import {defineField, defineType} from 'sanity'

// The site's info text (#info), shown beside the logo. There's just one.
export const info = defineType({
  name: 'info',
  title: 'Info',
  type: 'document',
  fields: [defineField({name: 'text', title: 'Text', type: 'richText'})],
  preview: {prepare: () => ({title: 'Info'})},
})
