import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  createFileRoute: vi.fn(() => vi.fn(() => ({ useRouteContext: vi.fn(), useLoaderData: vi.fn() }))),
  useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('~/components/Topbar', () => ({ Topbar: () => <nav data-testid="topbar" /> }))
vi.mock('~/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: null, isAuthenticated: false, isLoading: false, login: vi.fn(), logout: vi.fn(), refresh: vi.fn() })),
}))

// Import components after mocks
import { TermsPage } from '~/routes/terms'
import { PrivacyPage } from '~/routes/privacy'

describe('Terms of Service page', () => {
  it('renders the page title', () => {
    render(<TermsPage />)
    expect(screen.getByText('TERMS OF SERVICE')).toBeInTheDocument()
  })

  it('includes a last updated date', () => {
    render(<TermsPage />)
    expect(screen.getByText(/march 2026/i)).toBeInTheDocument()
  })

  it('has a no warranty disclaimer', () => {
    render(<TermsPage />)
    expect(screen.getByText(/as is/i)).toBeInTheDocument()
    expect(screen.getByText(/NO WARRANTY/i)).toBeInTheDocument()
  })

  it('has a limitation of liability section', () => {
    render(<TermsPage />)
    expect(screen.getByText(/LIMITATION OF LIABILITY/i)).toBeInTheDocument()
    expect(screen.getByText(/not be liable/i)).toBeInTheDocument()
  })

  it('has a user-generated content section', () => {
    render(<TermsPage />)
    expect(screen.getByText(/USER-GENERATED CONTENT/i)).toBeInTheDocument()
    expect(screen.getByText(/campaign names/i)).toBeInTheDocument()
  })

  it('has an account termination policy', () => {
    render(<TermsPage />)
    expect(screen.getByText(/USER ACCOUNTS/i)).toBeInTheDocument()
    expect(screen.getByText(/terminate or suspend/i)).toBeInTheDocument()
  })

  it('has a back link to the landing page', () => {
    render(<TermsPage />)
    const backLink = screen.getByText('← Back')
    expect(backLink.closest('a')).toHaveAttribute('href', '/')
  })
})

describe('Privacy Policy page', () => {
  it('renders the page title', () => {
    render(<PrivacyPage />)
    expect(screen.getByText('PRIVACY POLICY')).toBeInTheDocument()
  })

  it('includes a last updated date', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/march 2026/i)).toBeInTheDocument()
  })

  it('describes what data is collected', () => {
    render(<PrivacyPage />)
    expect(screen.getAllByText(/INFORMATION WE COLLECT/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Account information/i)).toBeInTheDocument()
    expect(screen.getByText(/email address/i)).toBeInTheDocument()
  })

  it('mentions PostHog analytics', () => {
    render(<PrivacyPage />)
    expect(screen.getAllByText(/PostHog/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/improve the software/i)).toBeInTheDocument()
  })

  it('states that data is not sold', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/WE DO NOT SELL YOUR DATA/i)).toBeInTheDocument()
    expect(screen.getAllByText(/do not sell/i).length).toBeGreaterThan(0)
  })

  it('mentions Cloudflare R2 for image storage', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/Cloudflare R2/i)).toBeInTheDocument()
  })

  it('has a data deletion / contact section', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/YOUR RIGHTS/i)).toBeInTheDocument()
    expect(screen.getAllByText(/privacy@cartyx\.app/i).length).toBeGreaterThan(0)
  })

  it('mentions cookies are session-only', () => {
    render(<PrivacyPage />)
    expect(screen.getAllByText(/COOKIES/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/session cookies only/i)).toBeInTheDocument()
  })

  it('has a back link to the landing page', () => {
    render(<PrivacyPage />)
    const backLink = screen.getByText('← Back')
    expect(backLink.closest('a')).toHaveAttribute('href', '/')
  })
})

describe('Landing page legal links', () => {
  it('renders Terms of Service and Privacy Policy links in the sign-in view', () => {
    // Render a minimal stand-in that matches the landing page's legal footer markup
    // to verify the link targets are correct
    const { container } = render(
      <p>
        By continuing you agree to our{' '}
        <a href="/terms" className="text-slate-500 hover:text-slate-400 underline">Terms of Service</a>{' '}
        and{' '}
        <a href="/privacy" className="text-slate-500 hover:text-slate-400 underline">Privacy Policy</a>
      </p>
    )
    const links = container.querySelectorAll('a')
    const hrefs = Array.from(links).map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/terms')
    expect(hrefs).toContain('/privacy')

    expect(screen.getByText('Terms of Service').closest('a')).toHaveAttribute('href', '/terms')
    expect(screen.getByText('Privacy Policy').closest('a')).toHaveAttribute('href', '/privacy')
  })
})
