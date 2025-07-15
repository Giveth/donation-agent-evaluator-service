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

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["node", "dist/src/main.js"]
