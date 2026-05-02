# Here's What Yer Gonna Do

> *"Here's what yer gonna do."* — Mike Ehrmantraut

Enter your to-do list. Mike delivers it back to you as a direct briefing — in his voice, on video.

Built for the [backboard.io/challenge](https://backboard.io/challenge) — gunning for **Craziest**.

---

## How it works

1. **You** type in your to-do list
2. **Backboard.io** routes it to a persistent "Mike Ehrmantraut" AI assistant (Claude claude-opus-4-7 under the hood) that rewrites it as a no-nonsense monologue — with cross-session memory so Mike remembers if he's briefed you before
3. **ElevenLabs** synthesizes the audio in a gravelly, dead-serious voice
4. **D-ID** animates a Mike Ehrmantraut photo into a talking-head video
5. **Mike** tells you exactly what yer gonna do

---

## Why Backboard.io?

Backboard is the AI orchestration layer. It handles:

- **Unified LLM access** — one API key to route to Claude, GPT-4, Mistral, and 2,000+ other models
- **Persistent memory** — Mike is a stateful assistant that accumulates context across every session. With `memory: "Auto"`, Backboard automatically extracts and stores facts. Mike can acknowledge repeat customers.
- **Assistant lifecycle** — the Mike assistant is created once and reused across all requests, not re-instantiated per call

Without Backboard, this would require wiring the Anthropic SDK, a vector DB, session management, and multi-model routing separately.

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
| `BACKBOARD_API_KEY` | ✅ | Backboard.io key — [backboard.io](https://backboard.io) |
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs key — [elevenlabs.io](https://elevenlabs.io) |
| `D_ID_API_KEY` | Optional | D-ID key for video — [d-id.com](https://www.d-id.com) |
| `MIKE_IMAGE_URL` | Optional | Public URL to a Mike Ehrmantraut photo |
| `PUBLIC_URL` | Optional | Your server's public URL (needed for D-ID to fetch audio) |
| `BACKBOARD_ASSISTANT_ID` | Optional | Reuse an existing Mike assistant across restarts |
| `ELEVENLABS_VOICE_ID` | Optional | Override the default voice (default: Arnold — deep & gravelly) |

> **Tip for voice:** Search ElevenLabs' community voice library for **"Mike Ehrmantraut"** or **"Jonathan Banks"** for a spot-on match.

> **Tip for D-ID image:** Use a clean, front-facing, neutral-expression photo — D-ID's lip sync works best with those.

> **Tip for BACKBOARD_ASSISTANT_ID:** On first startup the server creates the Mike assistant and logs its ID. Save it to `.env` so it's reused across restarts instead of scanning the assistant list each time.

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
| Backboard + ElevenLabs + D-ID | 🎬 Full talking-head video |
| Backboard + ElevenLabs | 🔊 Audio with animated display |
| Backboard only | 📄 Script-only |

---

## Deploy

Works on Railway, Render, Fly.io, or any Node host. Set your env vars in the platform dashboard, and set `PUBLIC_URL` to your deployed URL so D-ID can fetch the audio files.

---

## Tech stack

- **[Backboard.io](https://backboard.io)** — AI orchestration, LLM routing, and persistent cross-session memory
- **[ElevenLabs](https://elevenlabs.io)** — voice synthesis
- **[D-ID](https://d-id.com)** — talking-head video from a still photo
- **Node.js + Express** — backend
- Vanilla HTML/CSS/JS — no framework overhead, maximum Breaking Bad aesthetic
