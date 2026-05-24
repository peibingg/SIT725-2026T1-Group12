# Task Marketplace — production image (Node LTS + Express API + public/ static UI)
FROM node:22-bookworm-slim

WORKDIR /app

RUN groupadd --system --gid 1001 nodeapp \
  && useradd --system --uid 1001 --gid nodeapp --home-dir /app nodeapp

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && chown -R nodeapp:nodeapp /app

COPY --chown=nodeapp:nodeapp . .

USER nodeapp

ENV NODE_ENV=production
ENV PORT=3000
# Override NODE_ENV at runtime (e.g. docker compose sets development for local HTTP).

EXPOSE 3000

CMD ["node", "server.js"]
