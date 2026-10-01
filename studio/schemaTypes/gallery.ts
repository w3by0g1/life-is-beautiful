import {defineArrayMember, defineField, defineType} from 'sanity'
import {GalleryImagesInput} from '../components/GalleryImagesInput'

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
      description:
        'Shown in this order; drag to rearrange. Upload several at once with the button (or drop them here), then click each to add its details.',
      type: 'array',
      components: {input: GalleryImagesInput},
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
              description: "What the image shows, for anyone who can't see it.",
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
              description: "e.g. a photographer's name.",
              type: 'string',
            }),
          ],
          // Freshly uploaded images say so until their details are added.
          preview: {
            select: {media: 'asset', title: 'caption', subtitle: 'credit', alt: 'alt'},
            prepare: ({
              media,
              title,
              subtitle,
              alt,
            }: {
              media?: unknown
              title?: string
              subtitle?: string
              alt?: string
            }) => ({
              title: title || alt || 'Image',
              subtitle: subtitle || (title || alt ? undefined : 'No details yet'),
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
