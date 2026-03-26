#!/usr/bin/env node
/**
 * Storybook static build workaround for Vite 7 + TanStack Start projects.
 *
 * Two issues fixed:
 *
 * 1. The project's vite.config.ts includes nitro() and tanstackStart() plugins
 *    which override Vite's outDir to '.output/public', so the preview bundle
 *    goes there instead of storybook-static. Fixed by filtering them in viteFinal
 *    inside .storybook/main.ts.
 *
 * 2. public/index.html (the app's loading screen) exists in the project root.
 *    Vite copies public/ to the build output, overwriting Storybook's generated
 *    manager index.html. Fixed by temporarily renaming it during the build.
 */

import { execSync } from 'child_process'
import { existsSync, renameSync } from 'fs'

const publicIndex = 'public/index.html'
const publicIndexTemp = 'public/index.html.sb-bak'

// Guard against a stale backup from a previously interrupted build.
if (existsSync(publicIndexTemp)) {
  console.error(
    '✗ Temp backup public/index.html.sb-bak already exists.\n' +
    '  This usually means a previous Storybook build was interrupted.\n' +
    '  - If public/index.html is missing, restore it: mv public/index.html.sb-bak public/index.html\n' +
    '  - Otherwise delete public/index.html.sb-bak and run this script again.'
  )
  process.exit(1)
}

if (existsSync(publicIndex)) {
  renameSync(publicIndex, publicIndexTemp)
  console.log('→ Temporarily renamed public/index.html')
}

try {
  console.log('→ Building Storybook...')
  execSync('npx storybook build', { stdio: 'inherit' })
} finally {
  if (existsSync(publicIndexTemp)) {
    renameSync(publicIndexTemp, publicIndex)
    console.log('→ Restored public/index.html')
  }
}

console.log('✓ Done! Output in: storybook-static')
