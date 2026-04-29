# Bot runtime image. Includes ffmpeg + yt-dlp for music playback.
#
# Why a hand-written Dockerfile vs Nixpacks: Nixpacks's auto-detection
# doesn't reliably install `yt-dlp` (it's a Python wheel, not a Node
# dep), and pinning it through nixpacks.toml is fragile across Dokploy
# versions. A 30-line Dockerfile is reproducible and unambiguous.
FROM node:20-bookworm-slim

# System deps for music:
#   - ffmpeg: PCM transcoding pipe (used in voice/source.ts)
#   - python3 + pip: required to install yt-dlp
#   - ca-certificates: HTTPS for both yt-dlp and the bot
#
# yt-dlp is installed via pip (not apt) because YouTube changes its
# anti-scrape behaviour every few weeks; pip wheels are released
# within hours, the apt package can lag months. The
# --break-system-packages flag is required on Debian Bookworm because
# its Python is marked PEP 668 "externally managed."
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        ca-certificates \
    && pip3 install --break-system-packages --no-cache-dir -U yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps first so Docker can cache the layer when only
# source files change.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest and compile.
COPY . .
RUN npm run build

# The bot is a worker — no exposed port. Logs go to stdout (pino
# pretty-prints in dev; raw JSON in prod is fine).
CMD ["npm", "start"]
