import React from 'react';
import { ExternalLink } from 'lucide-react';

interface ExternalLinkItemProps {
  name: string;
  url: string;
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function ExternalLinkItem({ name, url }: ExternalLinkItemProps) {
  if (!isSafeUrl(url)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition-colors py-0.5"
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      <span>{name}</span>
    </a>
  );
}
