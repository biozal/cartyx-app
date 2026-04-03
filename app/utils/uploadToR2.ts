import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { captureException } from '~/providers/PostHogProvider'

const getUploadUrlFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    contentType: z.string(),
    subdir: z.string().regex(/^uploads\/[a-zA-Z0-9_-]+$/).default('uploads/campaigns'),
  }))
  .handler(async ({ data }) => {
    const { getUploadUrl } = await import('~/server/functions/uploads')
    return getUploadUrl({ data })
  })

export async function uploadToR2(
  file: File,
  subdir = 'uploads/campaigns',
): Promise<{ imageKey: string; publicUrl: string }> {
  try {
    const { uploadUrl, imageKey, publicUrl } = await getUploadUrlFn({
      data: { contentType: file.type, subdir },
    })

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })

    if (!response.ok) {
      throw new Error(`R2 upload failed: ${response.status}`)
    }

    return { imageKey, publicUrl }
  } catch (e) {
    captureException(e, { action: 'uploadToR2', fileName: file.name, fileSize: file.size })
    throw e
  }
}
