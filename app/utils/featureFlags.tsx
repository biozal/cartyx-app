import {
  useFeatureFlagEnabled as usePostHogFeatureFlagEnabled,
  useFeatureFlagPayload as usePostHogFeatureFlagPayload,
  useFeatureFlagVariantKey,
} from '@posthog/react'
import type { JsonType } from 'posthog-js'
import type { ReactNode } from 'react'

export interface FeatureFlagState<TPayload = JsonType> {
  isEnabled: boolean
  isLoading: boolean
  payload: TPayload | null
  variant: string | boolean | undefined
}

function normalizePayload<TPayload>(payload: JsonType): TPayload | null {
  return (payload ?? null) as TPayload | null
}

export function useFeatureFlag(flag: string): FeatureFlagState {
  const isEnabled = usePostHogFeatureFlagEnabled(flag)
  const payload = usePostHogFeatureFlagPayload(flag)
  const variant = useFeatureFlagVariantKey(flag)

  return {
    isEnabled: isEnabled ?? false,
    isLoading: isEnabled === undefined,
    payload: normalizePayload(payload),
    variant,
  }
}

export function useFeatureFlagEnabled(flag: string): boolean {
  return usePostHogFeatureFlagEnabled(flag) ?? false
}

export function useFeatureFlagPayload<TPayload = JsonType>(flag: string): TPayload | null {
  return normalizePayload<TPayload>(usePostHogFeatureFlagPayload(flag))
}

export function useFeatureFlagVariant(flag: string): string | boolean | undefined {
  return useFeatureFlagVariantKey(flag)
}

export function FeatureFlagGate({
  flag,
  children,
  fallback = null,
}: {
  flag: string
  children: ReactNode
  fallback?: ReactNode
}) {
  return useFeatureFlagEnabled(flag) ? <>{children}</> : <>{fallback}</>
}
