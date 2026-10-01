import {useRef, useState} from 'react'
import {Button, Flex, Stack, Text} from '@sanity/ui'
import {UploadIcon} from '@sanity/icons/Upload'
import {type ArrayOfObjectsInputProps, insert, setIfMissing, useClient} from 'sanity'

// How many images go up at once.
const AT_ONCE = 4

const newKey = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)

// The gallery's image list, with a button above it for uploading many images
// at once: pick them all, they're uploaded and added to the end of the list
// in the order picked, and each one's details (alt text, caption, credit) can
// be filled in afterwards by clicking it. Dropping files onto the list still
// works too.
export function GalleryImagesInput(props: ArrayOfObjectsInputProps) {
  const {onChange, readOnly, renderDefault} = props
  const client = useClient({apiVersion: '2025-02-19'})
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{done: number; total: number} | null>(null)
  const [failed, setFailed] = useState<string[]>([])

  const upload = async (files: File[]) => {
    if (!files.length) return
    setFailed([])
    setProgress({done: 0, total: files.length})
    const assetIds: (string | null)[] = new Array(files.length).fill(null)
    const failures: string[] = []
    let next = 0
    const worker = async () => {
      while (next < files.length) {
        const i = next++
        try {
          const asset = await client.assets.upload('image', files[i], {filename: files[i].name})
          assetIds[i] = asset._id
        } catch (err) {
          console.warn(`Couldn't upload ${files[i].name}:`, err)
          failures.push(files[i].name)
        }
        setProgress((p) => p && {...p, done: p.done + 1})
      }
    }
    await Promise.all(Array.from({length: Math.min(AT_ONCE, files.length)}, worker))

    const items = assetIds
      .filter((id): id is string => Boolean(id))
      .map((id) => ({_type: 'photo', _key: newKey(), asset: {_type: 'reference', _ref: id}}))
    if (items.length) onChange([setIfMissing([]), insert(items, 'after', [-1])])
    setFailed(failures)
    setProgress(null)
  }

  return (
    <Stack gap={3}>
      <Flex align="center" gap={3} wrap="wrap">
        <Button
          icon={UploadIcon}
          mode="ghost"
          text={progress ? `Uploading ${progress.done} of ${progress.total}…` : 'Upload images'}
          disabled={Boolean(readOnly) || Boolean(progress)}
          onClick={() => fileRef.current?.click()}
        />
        <Text size={1} muted>
          Pick as many as you like; add their details afterwards by clicking each one.
        </Text>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? [])
            // So picking the same files again still counts as a change.
            e.currentTarget.value = ''
            upload(files)
          }}
        />
      </Flex>
      {failed.length > 0 && (
        <Text size={1} style={{color: 'var(--card-badge-critical-dot-color, #e5484d)'}}>
          Couldn't upload: {failed.join(', ')}
        </Text>
      )}
      {renderDefault(props)}
    </Stack>
  )
}
