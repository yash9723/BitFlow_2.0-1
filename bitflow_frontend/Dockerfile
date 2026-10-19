FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Copy application source
COPY . .

# Set environment variables for build time
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Public origin and contact address are baked into statically rendered pages
# (metadata, sitemap, legal pages), so they're needed at build time too.
ARG SITE_URL=http://localhost:3000
ARG CONTACT_EMAIL=
ENV SITE_URL=$SITE_URL CONTACT_EMAIL=$CONTACT_EMAIL

# Generate prisma client and build Next.js app
RUN npx prisma generate
RUN npm run build

# Production image
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
# prisma/seed.ts (run at startup) resolves "@/..." imports via tsconfig paths
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/app ./app
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000

CMD ["node", "scripts/start-with-db.mjs"]
