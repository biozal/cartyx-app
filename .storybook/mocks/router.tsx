import React from 'react'
export * from '@tanstack/react-router'

export type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  to?: string
  children?: React.ReactNode
  className?: string
}

export function Link({ to, children, ...props }: LinkProps) {
  return <a href={to} {...props}>{children}</a>
}
