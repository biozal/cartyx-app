import React, { type ButtonHTMLAttributes, type AnchorHTMLAttributes, forwardRef } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';

type Variant = 'primary' | 'secondary' | 'warning' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' };
type AnchorProps = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { as: 'a' };
type RouterLinkProps = BaseProps &
  Omit<LinkProps, 'className'> & { as: 'link'; className?: string };

export type PixelButtonProps = ButtonProps | AnchorProps | RouterLinkProps;

const variantStyles: Record<Variant, string> = {
  primary: [
    'bg-gradient-to-b from-blue-500 to-blue-700',
    'border-2 border-blue-400/60',
    'text-white',
    'shadow-[0_2px_0_0_#1e3a5f]',
    'hover:from-blue-400 hover:to-blue-600 hover:border-blue-300/70',
    'hover:shadow-[0_2px_0_0_#1e3a5f,0_0_12px_rgba(59,130,246,0.3)]',
    'active:from-blue-600 active:to-blue-800',
  ].join(' '),
  secondary: [
    'bg-transparent',
    'border-2 border-white/20',
    'text-slate-300',
    'shadow-[0_2px_0_0_rgba(255,255,255,0.05)]',
    'hover:border-white/40 hover:text-white hover:bg-white/[0.04]',
    'hover:shadow-[0_2px_0_0_rgba(255,255,255,0.1)]',
    'active:bg-white/[0.08]',
  ].join(' '),
  warning: [
    'bg-transparent',
    'border-2 border-yellow-500/40',
    'text-yellow-400',
    'shadow-[0_2px_0_0_rgba(234,179,8,0.1)]',
    'hover:border-yellow-400/60 hover:text-yellow-300 hover:bg-yellow-500/[0.06]',
    'hover:shadow-[0_2px_0_0_rgba(234,179,8,0.15),0_0_12px_rgba(234,179,8,0.1)]',
    'active:bg-yellow-500/[0.1]',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'border-2 border-transparent',
    'text-slate-400',
    'hover:text-slate-200 hover:bg-white/[0.04] hover:border-white/10',
    'active:bg-white/[0.08]',
  ].join(' '),
  danger: [
    'bg-transparent',
    'border-2 border-red-500/40',
    'text-red-400',
    'shadow-[0_2px_0_0_rgba(239,68,68,0.1)]',
    'hover:border-red-400/60 hover:text-red-300 hover:bg-red-500/[0.06]',
    'active:bg-red-500/[0.1]',
  ].join(' '),
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-[10px] gap-1.5',
  md: 'px-5 py-2.5 text-[11px] gap-2',
  lg: 'px-6 py-3.5 text-[13px] gap-2.5',
};

function buildClassName(props: BaseProps & { className?: string }) {
  const { variant = 'primary', size = 'md', fullWidth, className = '' } = props;
  return [
    'inline-flex items-center justify-center',
    'font-sans font-semibold leading-none',
    'rounded-sm',
    'transition-all duration-150',
    'select-none whitespace-nowrap',
    'disabled:opacity-40 disabled:pointer-events-none',
    // Variant + size
    variantStyles[variant],
    sizeStyles[size],
    // Full width
    fullWidth ? 'w-full' : '',
    // Custom classes
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export const PixelButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, PixelButtonProps>(
  function PixelButton(props, ref) {
    const { variant, size, icon, fullWidth, ...rest } = props;

    const content = (
      <>
        {icon && <span className="inline-block">{icon}</span>}
        {props.children}
      </>
    );

    if (props.as === 'link') {
      const { as: _as, className, children: _children, ...linkProps } = rest as RouterLinkProps;
      void _as;
      void _children;
      return (
        <Link
          {...(linkProps as Omit<LinkProps, 'className'>)}
          className={buildClassName({ variant, size, fullWidth, className })}
        >
          {content}
        </Link>
      );
    }

    if (props.as === 'a') {
      const { as: _as, className, children: _children, ...anchorProps } = rest as AnchorProps;
      void _as;
      void _children;
      return (
        <a
          {...anchorProps}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={buildClassName({ variant, size, fullWidth, className })}
        >
          {content}
        </a>
      );
    }

    const { as: _as, className, children: _children, ...buttonProps } = rest as ButtonProps;
    void _as;
    void _children;
    return (
      <button
        {...buttonProps}
        ref={ref as React.Ref<HTMLButtonElement>}
        className={buildClassName({ variant, size, fullWidth, className })}
      >
        {content}
      </button>
    );
  }
);
