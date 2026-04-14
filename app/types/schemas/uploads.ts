import { z } from 'zod'

export const getUploadUrlSchema = z.object({
  contentType: z.string(),
  subdir: z
    .string()
    .regex(/^uploads\/[a-zA-Z0-9_-]+$/)
    .default('uploads/campaigns'),
})
