FROM node:18-slim

# Install Python for Edge TTS
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install --break-system-packages edge-tts && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
