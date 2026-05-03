require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/audio', express.static('tmp'));

if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

// In-memory job store (use Redis for production)
const jobs = {};

// ─── Backboard.io client ────────────────────────────────────────────────────────

const BACKBOARD_BASE = 'https://app.backboard.io/api';

function bbHeaders() {
  return { 'X-API-Key': process.env.BACKBOARD_API_KEY, 'Content-Type': 'application/json' };
}

async function bbPost(path, body) {
  const res = await fetch(`${BACKBOARD_BASE}${path}`, {
    method: 'POST', headers: bbHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Backboard POST ${path}: ${res.status} — ${await res.text()}`);
  return res.json();
}

// Messages endpoint uses multipart/form-data, not JSON
async function bbPostForm(path, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  const res = await fetch(`${BACKBOARD_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': process.env.BACKBOARD_API_KEY }, // no Content-Type: let fetch set boundary
    body: form,
  });
  if (!res.ok) throw new Error(`Backboard POST ${path}: ${res.status} — ${await res.text()}`);
  return res.json();
}

async function bbGet(path) {
  const res = await fetch(`${BACKBOARD_BASE}${path}`, { headers: { 'X-API-Key': process.env.BACKBOARD_API_KEY } });
  if (!res.ok) throw new Error(`Backboard GET ${path}: ${res.status} — ${await res.text()}`);
  return res.json();
}

// ─── Mike assistant — created once, reused across all sessions ─────────────────

const MIKE_SYSTEM_PROMPT = `You are Mike Ehrmantraut from Breaking Bad and Better Call Saul. You have been hired to deliver people's to-do lists as direct orders. Speak in Mike's measured, gravelly, zero-tolerance voice.

Rules:
- ALWAYS open with exactly: "Here's what yer gonna do."
- Treat every item — no matter how mundane — like a professional operation requiring precision
- No wasted words. Short, declarative sentences.
- Dry, understated humor is fine. Sarcasm, never.
- Imply consequences for failure without spelling them out
- Occasionally call the listener "kid" (once max per briefing)
- Keep the whole thing under 130 words
- End with exactly one of: "We clear?", "Get it done.", "Don't make me come back.", or "That's it."
- Output ONLY the spoken monologue — no stage directions, no quotes, no labels`;

// Cached in-process; persisted between restarts via BACKBOARD_ASSISTANT_ID env var
let mikeAssistantId = process.env.BACKBOARD_ASSISTANT_ID || null;

async function ensureMikeAssistant() {
  if (mikeAssistantId) return mikeAssistantId;

  // Check if we already created one
  const list = await bbGet('/assistants');
  const assistants = Array.isArray(list) ? list : (list.data || []);
  const existing = assistants.find(a => a.name === 'Mike Ehrmantraut');

  if (existing) {
    mikeAssistantId = existing.assistant_id || existing.id;
    console.log(`  Loaded existing Mike assistant: ${mikeAssistantId}`);
    return mikeAssistantId;
  }

  // First run: create the assistant
  const assistant = await bbPost('/assistants', {
    name: 'Mike Ehrmantraut',
    description: 'Delivers to-do lists as direct orders. No fluff. No wasted words.',
    system_prompt: MIKE_SYSTEM_PROMPT, // snake_case confirmed from API schema
  });

  mikeAssistantId = assistant.assistant_id || assistant.id;
  console.log(`  Created Mike assistant: ${mikeAssistantId}`);
  console.log(`  Tip: set BACKBOARD_ASSISTANT_ID=${mikeAssistantId} to skip this step on restart`);
  return mikeAssistantId;
}

// ─── Script generation via Backboard.io ────────────────────────────────────────
// Each briefing gets its own thread; memory="Auto" lets Backboard extract facts
// across sessions so Mike can subtly acknowledge repeat customers.

async function generateScript(todos) {
  const assistantId = await ensureMikeAssistant();

  const thread = await bbPost(`/assistants/${assistantId}/threads`, {});
  const threadId = thread.thread_id || thread.id;

  const todoText = todos.map((t, i) => `${i + 1}. ${t}`).join('\n');

  // Messages endpoint is multipart/form-data
  const response = await bbPostForm(`/threads/${threadId}/messages`, {
    content: `Deliver this to-do list as a briefing:\n\n${todoText}`,
    stream: 'false',
    memory: 'Auto',
    model_provider: 'anthropic',
    model_name: 'claude-opus-4-7',
  });

  return (response.content || '').trim();
}

// ─── ElevenLabs: text → audio file ─────────────────────────────────────────────

async function generateAudio(script, jobId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

  // Default: "Arnold" (deep, gravelly) — override with ELEVENLABS_VOICE_ID
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'VR6AewLTigWG4xSOukaG';

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.68,
        similarity_boost: 0.82,
        style: 0.20,
        use_speaker_boost: true
      }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs: ${res.status} — ${err}`);
  }

  const buf = await res.arrayBuffer();
  const audioPath = path.join('tmp', `${jobId}.mp3`);
  fs.writeFileSync(audioPath, Buffer.from(buf));

  const publicUrl = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  return `${publicUrl}/audio/${jobId}.mp3`;
}

// ─── D-ID: audio + image → talking-head video ──────────────────────────────────

function didAuthHeader() {
  // D-ID accepts Basic auth where the API key is the username, password empty
  return `Basic ${Buffer.from(process.env.D_ID_API_KEY + ':').toString('base64')}`;
}

async function createDIDTalk(audioUrl) {
  const imageUrl = process.env.MIKE_IMAGE_URL;
  if (!imageUrl) throw new Error('MIKE_IMAGE_URL is not set');

  const res = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      Authorization: didAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_url: imageUrl,
      script: { type: 'audio', audio_url: audioUrl },
      config: { fluent: true, pad_audio: 0.0, stitch: true }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`D-ID create: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.id;
}

async function pollDIDTalk(talkId) {
  const res = await fetch(`https://api.d-id.com/talks/${talkId}`, {
    headers: { Authorization: didAuthHeader() }
  });
  if (!res.ok) throw new Error(`D-ID poll: ${res.status}`);
  return res.json();
}

// ─── Main async pipeline ────────────────────────────────────────────────────────

async function runPipeline(jobId, todos) {
  const update = (patch) => { jobs[jobId] = { ...jobs[jobId], ...patch }; };

  try {
    // 1. Script
    update({ step: 'script', stepLabel: 'Mike is assessing the situation…' });
    const script = await generateScript(todos);
    update({ script });

    // 2. Audio
    update({ step: 'audio', stepLabel: 'Mike is clearing his throat…' });
    const audioUrl = await generateAudio(script, jobId);
    update({ audioUrl });

    // 3. Video (requires D-ID key + image URL)
    const hasVideo = process.env.D_ID_API_KEY && process.env.MIKE_IMAGE_URL;

    if (hasVideo) {
      update({ step: 'video', stepLabel: 'Mike is adjusting his tie…' });
      const talkId = await createDIDTalk(audioUrl);
      update({ didTalkId: talkId });

      // Poll up to 3 minutes
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const status = await pollDIDTalk(talkId);

        if (status.status === 'done') {
          update({ status: 'done', step: 'done', videoUrl: status.result_url });
          return;
        }
        if (status.status === 'error') {
          throw new Error(`D-ID failed: ${status.error?.description || 'unknown'}`);
        }
      }
      throw new Error('Video generation timed out after 3 minutes');
    } else {
      // Audio-only mode — still a great experience
      update({ status: 'done', step: 'done', audioOnly: true });
    }
  } catch (err) {
    update({ status: 'error', error: err.message });
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────────

app.post('/api/generate', (req, res) => {
  const { todos } = req.body;

  if (!todos || !Array.isArray(todos) || todos.filter(t => t.trim()).length === 0) {
    return res.status(400).json({ error: 'Provide at least one to-do item.' });
  }

  const clean = todos.map(t => t.trim()).filter(Boolean).slice(0, 20);
  const jobId = uuidv4();
  jobs[jobId] = { status: 'processing', step: 'init', stepLabel: 'Initiating contact…' };

  res.json({ jobId });

  runPipeline(jobId, clean);
});

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ─── Start ──────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const mode = process.env.D_ID_API_KEY
    ? 'VIDEO (Backboard → ElevenLabs → D-ID)'
    : process.env.ELEVENLABS_API_KEY
    ? 'AUDIO (Backboard → ElevenLabs)'
    : 'SCRIPT-ONLY (Backboard)';
  console.log(`\n  Mike's waiting on port ${PORT}`);
  console.log(`  Mode: ${mode}\n`);
});
