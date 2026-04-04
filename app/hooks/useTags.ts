import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import type { TagListItem } from '~/types/tag'
import { listTagsSchema } from '~/types/tag'
import { queryKeys } from '~/utils/queryKeys'

const listTagsFn = createServerFn({ method: 'GET' })
  .inputValidator(listTagsSchema)
  .handler(async ({ data }) => {
    const { listTags } = await import('~/server/functions/tags')
    return listTags({ data })
  })

export function useTags(campaignId: string) {
  const { data: tags = [], isLoading, error } = useQuery({
    queryKey: queryKeys.tags.list(campaignId),
    queryFn: () => listTagsFn({ data: { campaignId } }),
    enabled: !!campaignId,
  })

  return {
    tags: tags as TagListItem[],
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  }
}
