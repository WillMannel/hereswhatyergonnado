# Here's What Yer Gonna Do

> *"Here's what yer gonna do."* — Mike Ehrmantraut

Enter your to-do list. Mike delivers it back to you as a direct briefing — in his voice, on video.

Built for the [backboard.io/challenge](https://backboard.io/challenge) — gunning for **Craziest**.

---

## How it works

1. **You** type in your to-do list
2. **Claude** rewrites it as a Mike Ehrmantraut monologue
3. **ElevenLabs** synthesizes the audio in a gravelly, no-nonsense voice
4. **D-ID** animates a Mike Ehrmantraut photo into a talking-head video
5. **Mike** tells you exactly what yer gonna do

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/willmannel/hereswhatyergonnado
cd hereswhatyergonnado
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API key — [console.anthropic.com](https://console.anthropic.com) |
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs key — [elevenlabs.io](https://elevenlabs.io) |
| `D_ID_API_KEY` | Optional | D-ID key for video — [d-id.com](https://www.d-id.com) |
| `MIKE_IMAGE_URL` | Optional | Public URL to a Mike Ehrmantraut photo |
| `PUBLIC_URL` | Optional | Your server's public URL (needed for D-ID to fetch audio) |
| `ELEVENLABS_VOICE_ID` | Optional | Override the default voice (default: Arnold — deep & gravelly) |

> **Tip for voice:** Search ElevenLabs' community voice library for "Mike Ehrmantraut" or "Jonathan Banks" for a spot-on match.

> **Tip for D-ID image:** Use a clean, front-facing photo with good lighting. D-ID's liveness is best with a neutral expression.

### 3. Run

```bash
npm start
# or for dev with auto-reload:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Modes

The app degrades gracefully based on what's configured:

| Keys present | Mode |
|---|---|
| All three | 🎬 Full talking-head video |
| Anthropic + ElevenLabs | 🔊 Audio with animated display |
| Anthropic only | 📄 Script-only |

---

## Deploy

Works on Railway, Render, Fly.io, or any Node host. Set your env vars in the platform dashboard, and set `PUBLIC_URL` to your deployed URL so D-ID can fetch the audio files.

---

## Tech stack

- **[Claude](https://anthropic.com)** (claude-opus-4-7) — script generation in Mike's voice
- **[ElevenLabs](https://elevenlabs.io)** — voice synthesis
- **[D-ID](https://d-id.com)** — talking-head video from a still photo
- **Node.js + Express** — backend
- Vanilla HTML/CSS/JS — no framework overhead, maximum Breaking Bad aesthetic
