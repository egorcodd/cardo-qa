FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY services ./services
COPY packages ./packages
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node","services/gateway/index.ts"]
