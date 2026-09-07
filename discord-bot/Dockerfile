FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY entrypoint.mjs ./entrypoint.mjs

CMD ["node", "entrypoint.mjs"]
