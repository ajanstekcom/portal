# Stage 1: Builder
FROM node:20 AS builder
WORKDIR /app

# Install dependencies for both client and server
COPY client/package*.json ./client/
RUN cd client && npm install --include=dev

COPY server/package*.json ./server/
RUN cd server && npm install

# Copy source
COPY . .

# Build Client
WORKDIR /app/client
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npx vite build

# Stage 2: Runtime
FROM node:20-slim
WORKDIR /app

# Copy build results
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server ./server
COPY package*.json ./

# Persistence & Environment
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=5173
ENV DB_PATH=/app/data/database.sqlite

EXPOSE 5173

CMD ["node", "server/index.js"]
