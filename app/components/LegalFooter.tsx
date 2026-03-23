import { Link } from '@tanstack/react-router'

export function LegalFooter() {
  return (
    <p className="mt-8 text-[11px] text-slate-600 text-center leading-relaxed">
      By continuing you agree to our{' '}
      <Link to="/terms" className="text-slate-500 hover:text-slate-400 underline">Terms of Service</Link>{' '}
      and{' '}
      <Link to="/privacy" className="text-slate-500 hover:text-slate-400 underline">Privacy Policy</Link>
    </p>
  )
}
