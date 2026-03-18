# Stage 1: Install dependencies and download model
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY download-model.js index.js server.js ./
RUN node --max-old-space-size=4096 download-model.js

# Stage 2: Production image
FROM node:22-slim

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/models ./models
COPY --from=build /app/package.json ./
COPY --from=build /app/index.js ./
COPY --from=build /app/server.js ./

ENV LOCAL_MODELS_ONLY=true
ENV PORT=3000

USER node
EXPOSE 3000
CMD ["node", "server.js"]
