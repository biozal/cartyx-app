#!/usr/bin/env node
/**
 * Storybook 10 static build workaround.
 *
 * The regular `storybook build` produces the manager (index.html) but not the
 * preview iframe. `storybook build --preview-only` produces the preview assets
 * but no HTML. This script runs both, copies the preview assets into the output
 * directory, and generates a proper iframe.html so the manager can load
 * components when deployed as a static site.
 */

import { execSync } from 'child_process'
import { cpSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const OUT = 'storybook-static'
const PREVIEW_OUT = '.output/public'

console.log('→ Building Storybook preview...')
execSync('npx storybook build --preview-only', { stdio: 'inherit' })

console.log('→ Building Storybook manager...')
execSync('npx storybook build', { stdio: 'inherit' })

console.log('→ Copying preview assets into output...')
if (existsSync(join(PREVIEW_OUT, 'assets'))) {
  cpSync(join(PREVIEW_OUT, 'assets'), join(OUT, 'assets'), { recursive: true })
}
if (existsSync(join(PREVIEW_OUT, 'vite-inject-mocker-entry.js'))) {
  cpSync(join(PREVIEW_OUT, 'vite-inject-mocker-entry.js'), join(OUT, 'vite-inject-mocker-entry.js'))
}

console.log('→ Generating iframe.html...')

// Extract globals from the manager index.html
const managerHtml = readFileSync(join(OUT, 'index.html'), 'utf8')
const globalsMatch = managerHtml.match(/<script>\s*([\s\S]*?window\['CONFIG_TYPE'\][\s\S]*?)<\/script>/)
const globals = globalsMatch ? globalsMatch[1] : ''

// Find the main preview entry (vite-inject-mocker-entry.js or assets/main-*.js)
const previewEntry = existsSync(join(OUT, 'vite-inject-mocker-entry.js'))
  ? './vite-inject-mocker-entry.js'
  : './assets/main.js'

const iframeHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Storybook Preview</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @font-face {
        font-family: 'Nunito Sans';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('./sb-common-assets/nunito-sans-regular.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Nunito Sans';
        font-style: italic;
        font-weight: 400;
        font-display: swap;
        src: url('./sb-common-assets/nunito-sans-italic.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Nunito Sans';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('./sb-common-assets/nunito-sans-bold.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Nunito Sans';
        font-style: italic;
        font-weight: 700;
        font-display: swap;
        src: url('./sb-common-assets/nunito-sans-bold-italic.woff2') format('woff2');
      }
    </style>
    <script>
      ${globals}
      window.module = undefined;
      window.global = window;
    </script>
  </head>
  <body>
    <div id="storybook-root"></div>
    <div id="storybook-docs"></div>
    <script type="module" src="${previewEntry}"></script>
  </body>
</html>`

writeFileSync(join(OUT, 'iframe.html'), iframeHtml)
console.log(`✓ iframe.html written with entry: ${previewEntry}`)
console.log('✓ Done! Output in:', OUT)
