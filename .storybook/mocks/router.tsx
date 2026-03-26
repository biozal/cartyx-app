import React from 'react'

// Re-export everything from the real @tanstack/react-router using a direct
// file path so Vite's alias (which rewrites the bare specifier to this mock)
// doesn't cause a circular import.
export * from '../../node_modules/@tanstack/react-router/dist/esm/index.js'

// Override Link with a plain <a> so Storybook stories render without a
// RouterProvider context.
export type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  to?: string
  children?: React.ReactNode
  className?: string
}

export function Link({ to, children, ...props }: LinkProps) {
  return <a href={to} {...props}>{children}</a>
}
