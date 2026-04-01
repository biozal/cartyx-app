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

function normalizePayload<TPayload>(payload: JsonType | undefined): TPayload | null {
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

// Like useFeatureFlagEnabled but returns false when the flag name is empty
// (i.e. the env var is unset). PostHog is never queried with an empty string —
// a sentinel key is used instead so hook call count stays stable.
export function useOptionalFeatureFlagEnabled(flag: string): boolean {
  const enabled = usePostHogFeatureFlagEnabled(flag || '__ff_disabled__')
  return Boolean(flag) && (enabled ?? false)
}

export function useOptionalFeatureFlag(flag: string): { isEnabled: boolean; isLoading: boolean } {
  const enabled = usePostHogFeatureFlagEnabled(flag || '__ff_disabled__')
  return {
    isEnabled: Boolean(flag) && (enabled ?? false),
    isLoading: Boolean(flag) && enabled === undefined,
  }
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
  showFallbackWhileLoading = false,
}: {
  flag: string
  children: ReactNode
  fallback?: ReactNode
  showFallbackWhileLoading?: boolean
}) {
  const { isEnabled, isLoading } = useFeatureFlag(flag)

  if (isLoading && !showFallbackWhileLoading) return null

  return isEnabled ? <>{children}</> : <>{fallback}</>
}
