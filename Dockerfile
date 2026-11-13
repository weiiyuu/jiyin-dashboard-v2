FROM node:24.22.3-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS development
WORKDIR /app
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:24.22.3-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
