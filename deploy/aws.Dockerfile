FROM node:24-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build
RUN apk upgrade --no-cache && apk add --no-cache openssl ca-certificates
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:client && npm run build:server

FROM node:24-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS runtime
RUN apk upgrade --no-cache && apk add --no-cache openssl ca-certificates
WORKDIR /app
ARG REVISION
LABEL org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* /root/.npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY deploy/aws-runtime.mjs deploy/aws-init.mjs ./deploy/
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 8787
CMD ["node", "deploy/aws-runtime.mjs"]
