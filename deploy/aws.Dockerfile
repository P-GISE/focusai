FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:client && npm run build:server

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ARG REVISION
LABEL org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY deploy/aws-runtime.mjs deploy/aws-init.mjs ./deploy/
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 8787
CMD ["node", "deploy/aws-runtime.mjs"]
