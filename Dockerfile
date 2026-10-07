FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS web-build
COPY apps/web ./apps/web
COPY scripts/build-pwa.mjs ./scripts/build-pwa.mjs
RUN npm run build

FROM node:24-alpine AS server-dependencies
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspaces=false && npm cache clean --force
USER node

FROM server-dependencies AS service
ARG SERVICE
ENV SERVICE=$SERVICE
COPY packages ./packages
COPY services/${SERVICE} ./services/${SERVICE}
CMD ["sh","-c","exec node services/$SERVICE/index.ts"]

FROM server-dependencies AS gateway
COPY packages ./packages
COPY services/gateway ./services/gateway
COPY --from=web-build /app/dist ./dist
EXPOSE 8080
CMD ["node","services/gateway/index.ts"]
