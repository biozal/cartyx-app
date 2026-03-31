import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Mock routing
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  createFileRoute: () => ({
    useRouteContext: vi.fn(() => ({ user: { id: '1', name: 'Test', role: 'gm' } })),
  }),
  redirect: vi.fn(),
  useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('~/components/Topbar', () => ({ Topbar: () => <nav data-testid="topbar" /> }))
vi.mock('~/components/Toast', () => ({ Toast: () => <div />, showToast: vi.fn() }))
vi.mock('~/utils/posthog-client', () => ({ captureEvent: vi.fn() }))
vi.mock('~/hooks/useCampaigns', () => ({
  useCreateCampaign: vi.fn(() => ({ create: vi.fn(), isLoading: false, error: null })),
}))
vi.mock('~/server/functions/auth', () => ({ getMe: vi.fn() }))
vi.mock('~/constants/timezones', () => ({
  TIMEZONES: [['America/Chicago', 'Central Time (CT)']],
}))

const wizardSource = readFileSync(
  resolve(__dirname, '../../app/routes/campaigns/new.tsx'),
  'utf-8',
)

describe('Create-campaign wizard — step 1 image guidance (#302)', () => {
  it('includes recommended image-size guidance text', () => {
    expect(wizardSource).toContain('Recommended: 1200')
    expect(wizardSource).toContain('400px or larger')
    expect(wizardSource).toContain('PNG, JPG, WebP up to 10MB')
    expect(wizardSource).toContain('GIF up to 3MB')
  })

  it('validates allowed image types (PNG, JPEG, GIF, WebP)', () => {
    expect(wizardSource).toContain("'image/png'")
    expect(wizardSource).toContain("'image/jpeg'")
    expect(wizardSource).toContain("'image/gif'")
    expect(wizardSource).toContain("'image/webp'")
  })
})
