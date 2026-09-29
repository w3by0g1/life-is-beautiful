import {defineArrayMember, defineField, defineType} from 'sanity'

// The gallery (#gallery): a collection of images, shown in the order set here.
// There's just one.
export const gallery = defineType({
  name: 'gallery',
  title: 'Gallery',
  type: 'document',
  fields: [
    defineField({
      name: 'images',
      title: 'Images',
      description: 'Shown in this order; drag to rearrange.',
      type: 'array',
      of: [
        defineArrayMember({
          name: 'photo',
          title: 'Image',
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({
              name: 'alt',
              title: 'Alternative text',
              description: 'What the image shows, for anyone who can\'t see it.',
              type: 'string',
            }),
            defineField({
              name: 'caption',
              title: 'Caption',
              description: 'Shown with the image. Leave empty for none.',
              type: 'string',
            }),
            defineField({
              name: 'credit',
              title: 'Credit',
              description: 'e.g. a photographer\'s name.',
              type: 'string',
            }),
          ],
          preview: {
            select: {media: 'asset', title: 'caption', subtitle: 'credit'},
            prepare: ({media, title, subtitle}: {media?: unknown; title?: string; subtitle?: string}) => ({
              title: title || 'Image',
              subtitle,
              media: media as never,
            }),
          },
        }),
      ],
      options: {layout: 'grid'},
    }),
  ],
  preview: {
    select: {images: 'images'},
    prepare: ({images}: {images?: unknown[]}) => ({
      title: 'Gallery',
      subtitle: `${images?.length ?? 0} image${images?.length === 1 ? '' : 's'}`,
    }),
  },
})
