# Multi-stage build: one image serves the HTTP API, WebSocket game server and the static client.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/client/package.json apps/client/
RUN npm ci --omit=dev --workspace @astra/server && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/client/dist apps/client/dist
USER node
EXPOSE 8080
CMD ["node", "apps/server/dist/server.js"]
