# Bot runtime image. Includes ffmpeg + yt-dlp for music playback.
#
# Why a hand-written Dockerfile vs Nixpacks: Nixpacks's auto-detection
# doesn't reliably install `yt-dlp` (it's a Python wheel, not a Node
# dep), and pinning it through nixpacks.toml is fragile across Dokploy
# versions. A 30-line Dockerfile is reproducible and unambiguous.
FROM node:20-bookworm-slim

# System deps for music:
#   - ffmpeg:          PCM transcoding pipe (used in voice/source.ts)
#   - python3 + pip:   yt-dlp is a Python wheel
#   - ca-certificates: HTTPS for both yt-dlp and the bot
#   - curl + unzip:    needed by deno's installer
#
# yt-dlp is installed via pip (not apt) because YouTube changes its
# anti-scrape behaviour every few weeks; pip wheels are released
# within hours, the apt package can lag months.
#
# yt-dlp-ejs ships the External JavaScript Solver scripts yt-dlp uses
# to deobfuscate YouTube's "n" parameter challenge and signature
# cipher. Without these scripts, valid cookies still fail with a
# misleading "Sign in to confirm you're not a bot" error — yt-dlp got
# the formats but couldn't decode the signed URLs.
#
# deno is the JS runtime yt-dlp expects by default. It executes the
# EJS scripts in a sandbox. Node could substitute with extra flags
# but deno is the cleanest path. Installer goes to /usr/local so it
# lands on PATH automatically.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        ca-certificates \
        curl \
        unzip \
    && pip3 install --break-system-packages --no-cache-dir -U yt-dlp yt-dlp-ejs \
    && curl -fsSL https://deno.land/install.sh \
        | DENO_INSTALL=/usr/local sh -s -- -y \
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
