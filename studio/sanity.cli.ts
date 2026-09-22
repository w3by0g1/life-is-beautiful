import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '3x555lnx',
    dataset: 'production'
  },
  // The hosted studio's address: https://embossed-paper.sanity.studio
  studioHost: 'embossed-paper',
  deployment: {
    appId: 'lboemnbgjlvkrje05m4dk7uc',
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: true,
  },
})
