# Emotional Translator

> Speech → Feeling → Form

A real-time emotional analysis visualizer. You speak; it listens to both your words and vocal qualities, then transforms your emotional state into an evolving abstract artwork powered by OpenAI's Realtime API.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

### 3. Add your OpenAI API key

Open `.env` and replace the placeholder:

```
OPENAI_API_KEY=sk-your-real-key-here
```

> **Your API key never leaves the server.** The backend generates a short-lived ephemeral token which is the only credential passed to the browser.

### 4. Start the server

```bash
node server.js
```

### 5. Open in your browser

```
http://localhost:3000
```

---

## How It Works

1. You click the microphone button
2. Your browser requests an ephemeral session token from `localhost:3000/api/session`
3. The server calls `api.openai.com/v1/realtime/sessions` with your real API key and returns a short-lived token
4. The frontend opens a WebRTC connection directly to OpenAI using only the ephemeral token
5. Your speech streams to `gpt-4o-realtime-preview`, which responds with structured JSON emotional analysis
6. The p5.js canvas evolves in real time based on valence, arousal, intensity, dominant emotion, vocal features, and history

---

## Project Structure

```
emotional-translator/
├── server.js          ← Express backend (token endpoint)
├── package.json
├── .env               ← Your API key goes here (create from .env.example)
├── .env.example       ← Template
└── public/
    ├── index.html     ← App shell
    ├── style.css      ← Dark theme, typography, layout
    ├── app.js         ← Mic, WebRTC, Realtime API, UI controller
    └── sketch.js      ← p5.js visual engine
```

---

## Requirements

- Node.js 18+
- An OpenAI API key with access to `gpt-4o-realtime-preview-2024-12-17`
- A modern browser (Chrome or Edge recommended for WebRTC)
- A microphone

---

## Emotional Visual Mapping

| Parameter | Visual Effect |
|-----------|--------------|
| `valence` | Warm (positive) ↔ Cool (negative) color palette |
| `arousal` | Particle speed, flow field turbulence |
| `intensity` | Particle density, glow brightness, contrast |
| `dominant_emotion` | Texture language (anxiety=fragmented, sadness=drifting, joy=blooming…) |
| `vocal pace` | Flow field scale |
| `hesitation` | Particle freeze/stutter behavior |
| `pitch_variation` | Color saturation variance |
| `tension` | Flow field directional bias |
| History | Faint position trails connecting emotional arc over time |

---

## Troubleshooting

**"OPENAI_API_KEY is not set"** — Make sure you created `.env` (not just `.env.example`) and added your key.

**"OpenAI API returned 403"** — Your key may not have access to the Realtime API. Check your OpenAI account tier.

**No audio captured** — Allow microphone access in your browser when prompted.

**Blank canvas** — Check the browser console for errors. The canvas requires WebGL support.
