import { getUploadUrl } from '~/server/functions/uploads'
import { captureException } from '~/providers/PostHogProvider'

export async function uploadToR2(
  file: File,
  subdir = 'uploads/campaigns',
): Promise<{ imageKey: string; publicUrl: string }> {
  try {
    const { uploadUrl, imageKey, publicUrl } = await getUploadUrl({
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
