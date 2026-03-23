import { useState, useEffect, useCallback } from 'react'
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  joinCampaign,
  type CampaignData,
} from '~/server/functions/campaigns'
import { captureException } from '~/providers/PostHogProvider'
import { compressImage } from '~/utils/compressImage'

/** Max file size after compression that the server will accept (3MB decoded → ~4MB base64) */
const MAX_POST_COMPRESSION_SIZE = 3 * 1024 * 1024

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listCampaigns()
      setCampaigns(data)
    } catch (e) {
      captureException(e, { action: 'listCampaigns' })
      setError(e instanceof Error ? e.message : 'Failed to load campaigns')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { campaigns, isLoading, error, refresh: load }
}

export function useCampaign(id: string) {
  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCampaign(null)
    setError(null)
    setIsLoading(true)
    getCampaign({ data: { id } })
      .then((data: CampaignData | null) => setCampaign(data))
      .catch((e: unknown) => {
        captureException(e, { action: 'getCampaign', campaignId: id })
        setError(e instanceof Error ? e.message : 'Failed to load campaign')
      })
      .finally(() => setIsLoading(false))
  }, [id])

  return { campaign, isLoading, error }
}

interface CreateCampaignInput {
  name: string
  description: string
  schedFreq?: string
  schedDay?: string
  schedTime?: string
  schedTz?: string
  callUrl?: string
  dndBeyondUrl?: string
  maxPlayers?: number
  imageFile?: File | null
}

async function encodeImage(file: File): Promise<{ imageData: string; imageMime: string; imageName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result is "data:image/png;base64,AAAA..."
      const base64 = result.split(',')[1]
      resolve({ imageData: base64, imageMime: file.type, imageName: file.name })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function useCreateCampaign() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (input: CreateCampaignInput) => {
    setIsLoading(true)
    setError(null)
    try {
      let imagePayload = {}
      if (input.imageFile) {
        const compressed = await compressImage(input.imageFile)
        if (compressed.size > MAX_POST_COMPRESSION_SIZE) {
          throw new Error('Image is too large even after compression. Try a smaller file or a non-GIF format.')
        }
        imagePayload = await encodeImage(compressed)
      }
      const result = await createCampaign({
        data: {
          name: input.name,
          description: input.description,
          schedFreq: input.schedFreq,
          schedDay: input.schedDay,
          schedTime: input.schedTime,
          schedTz: input.schedTz,
          callUrl: input.callUrl,
          dndBeyondUrl: input.dndBeyondUrl,
          maxPlayers: input.maxPlayers,
          ...imagePayload,
        },
      })
      return result
    } catch (e) {
      captureException(e, { action: 'createCampaign' })
      const msg = e instanceof Error ? e.message : 'Failed to create campaign'
      setError(msg)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  return { create, isLoading, error }
}

export function useUpdateCampaign() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = async (id: string, input: CreateCampaignInput) => {
    setIsLoading(true)
    setError(null)
    try {
      let imagePayload = {}
      if (input.imageFile) {
        const compressed = await compressImage(input.imageFile)
        if (compressed.size > MAX_POST_COMPRESSION_SIZE) {
          throw new Error('Image is too large even after compression. Try a smaller file or a non-GIF format.')
        }
        imagePayload = await encodeImage(compressed)
      }
      const result = await updateCampaign({
        data: {
          id,
          name: input.name,
          description: input.description,
          schedFreq: input.schedFreq,
          schedDay: input.schedDay,
          schedTime: input.schedTime,
          schedTz: input.schedTz,
          callUrl: input.callUrl,
          dndBeyondUrl: input.dndBeyondUrl,
          maxPlayers: input.maxPlayers,
          ...imagePayload,
        },
      })
      return result
    } catch (e) {
      captureException(e, { action: 'updateCampaign', campaignId: id })
      const msg = e instanceof Error ? e.message : 'Failed to update campaign'
      setError(msg)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  return { update, isLoading, error }
}

export function useJoinCampaign() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = async (inviteCode: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await joinCampaign({ data: { inviteCode } })
      return result
    } catch (e) {
      captureException(e, { action: 'joinCampaign' })
      const msg = e instanceof Error ? e.message : 'Failed to join campaign'
      setError(msg)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  return { join, isLoading, error }
}
