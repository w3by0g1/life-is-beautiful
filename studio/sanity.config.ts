import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'embossed-paper',

  projectId: '3x555lnx',
  dataset: 'production',

  plugins: [
    structureTool({
      // Artists, in the order the site lists them.
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            S.listItem()
              .title('Artists')
              .schemaType('artist')
              .child(
                S.documentTypeList('artist')
                  .title('Artists')
                  .defaultOrdering([
                    {field: 'sortOrder', direction: 'asc'},
                    {field: 'name', direction: 'asc'},
                  ]),
              ),
            // The info text: a single document, opened directly.
            S.listItem().title('Info').id('info').child(S.document().schemaType('info').documentId('info').title('Info')),
            // Happenings, newest first.
            S.listItem()
              .title('Happenings')
              .schemaType('event')
              .child(S.documentTypeList('event').title('Happenings').defaultOrdering([{field: 'date', direction: 'desc'}])),
          ]),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
    // There's only one Info document (it's in the Content list).
    templates: (templates) => templates.filter((t) => t.schemaType !== 'info'),
  },
  document: {
    actions: (actions, {schemaType}) =>
      schemaType === 'info' ? actions.filter((a) => !['duplicate', 'delete', 'unpublish'].includes(a.action ?? '')) : actions,
  },
})
