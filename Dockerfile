# -----------------------------
# Donation Agent Evaluator Service – Dockerfile
# Multi-stage build for a lightweight production image
# -----------------------------

# -------- Build Stage --------
FROM node:24-alpine3.21 AS builder

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies – use package-lock for repeatability
COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the NestJS application
RUN npm run build

# -------- Production Stage --------
FROM node:24-alpine3.21

ENV NODE_ENV=production
WORKDIR /usr/src/app

# Copy production node_modules and built assets from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
# Also copy package.json, tsconfigs and source files needed for migrations
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/tsconfig*.json ./
COPY --from=builder /usr/src/app/src ./src
# Copy entrypoint script
COPY docker-entrypoint.sh .

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Expose the application port
EXPOSE 3333

# Use entrypoint to apply migrations and then start app
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
