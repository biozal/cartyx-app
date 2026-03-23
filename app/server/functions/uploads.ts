import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSession } from '../session'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'node:crypto'
import { serverCaptureException } from '../utils/posthog'

const ALLOWED_TYPES = new Map([
  ['image/webp', 'webp'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
])

export const getUploadUrl = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      contentType: z.string(),
      subdir: z
        .string()
        .regex(/^uploads\/[a-zA-Z0-9_-]+$/)
        .default('uploads/campaigns'),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSession()
    try {
      if (!user) throw new Error('Not authenticated')

      const ext = ALLOWED_TYPES.get(data.contentType)
      if (!ext) throw new Error('Only PNG, JPEG, GIF, and WebP images are allowed')

      const cdnUrl = process.env.CDN_URL
      if (!cdnUrl) throw new Error('Direct uploads require CDN_URL configuration')

      const accountId = process.env.R2_ACCOUNT_ID
      const accessKeyId = process.env.R2_ACCESS_KEY_ID
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
      const bucket = process.env.R2_BUCKET
      if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
        throw new Error('R2 configuration incomplete')
      }

      const key = `${data.subdir}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`

      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      })

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: data.contentType,
      })

      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
      const normalizedCdnUrl = cdnUrl.replace(/\/+$/, '')

      return { uploadUrl, imageKey: key, publicUrl: `${normalizedCdnUrl}/${key}` }
    } catch (e) {
      serverCaptureException(e, user?.id, { action: 'getUploadUrl' })
      throw e
    }
  })
