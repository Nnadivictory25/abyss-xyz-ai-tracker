# Stage 1: Build
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
RUN bun install

# Copy source files
COPY tsconfig.json ./
COPY types.d.ts ./
COPY src/ ./src/

# Build the TypeScript app
RUN bun build src/index.ts --target=bun --minify --outdir ./dist

# Stage 2: Production
FROM oven/bun:latest AS production

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Create directory for database
RUN mkdir -p /data

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/data/abyss.db

# Expose the port
EXPOSE 3000

# Run the compiled app
CMD ["bun", "run", "dist/index.js"]
