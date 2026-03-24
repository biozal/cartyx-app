// Mock TanStack Router's Link as a plain <a> for Storybook
import React from 'react'

export type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  to?: string
  children?: React.ReactNode
  className?: string
}

export function Link({ to, children, ...props }: LinkProps) {
  return <a href={to} {...props}>{children}</a>
}
