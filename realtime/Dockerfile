# Built from the repository root (`docker build -f realtime/Dockerfile .`): the
# service bundles the app's graph modules, so the build needs app/ and the root
# tsconfig (for the app's `~` alias). Packages stay external and come from this
# service's own lockfile.
FROM node:22-alpine AS build
WORKDIR /repo/realtime
COPY realtime/package.json realtime/package-lock.json ./
RUN npm ci
COPY tsconfig.json /repo/
COPY app /repo/app
COPY realtime/tsconfig.json ./
COPY realtime/src ./src
RUN npm run build && npm prune --omit=dev && rm -rf node_modules/.cache

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/realtime/dist ./dist
COPY --from=build --chown=node:node /repo/realtime/node_modules ./node_modules
COPY --chown=node:node realtime/package.json ./
USER node
EXPOSE 1999
CMD ["node", "dist/index.js"]
