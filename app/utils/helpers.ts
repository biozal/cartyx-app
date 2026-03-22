export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatInviteCode(raw: string): string {
  let v = raw.replace(/[^A-Z0-9a-z]/g, '').toUpperCase()
  if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4, 8)
  return v
}
