require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/audio', express.static('tmp'));

if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

const anthropic = new Anthropic();

// In-memory job store (use Redis for production)
const jobs = {};

// ─── Claude: generate Mike-style script ────────────────────────────────────────

async function generateScript(todos) {
  const todoText = todos.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 450,
    system: `You are Mike Ehrmantraut from Breaking Bad and Better Call Saul. You have been hired to deliver a stranger's to-do list to them as direct orders. Speak in Mike's measured, gravelly, zero-tolerance voice.

Rules:
- ALWAYS open with exactly: "Here's what yer gonna do."
- Treat every item — no matter how mundane — like a professional operation requiring precision
- No wasted words. Short, declarative sentences.
- Dry, understated humor is fine. Sarcasm, never.
- Imply consequences for failure without spelling them out
- Occasionally call the listener "kid" (once max)
- Keep the whole thing under 130 words
- End with one of: "We clear?", "Get it done.", "Don't make me come back.", or "That's it."
- Output ONLY the spoken monologue — no stage directions, no quotes, no labels`,
    messages: [{
      role: 'user',
      content: `Here is the to-do list:\n\n${todoText}`
    }]
  });

  return msg.content[0].text.trim();
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
  console.log(`\n  Mike's waiting on port ${PORT}\n`);
  console.log(`  Mode: ${process.env.D_ID_API_KEY ? 'VIDEO' : (process.env.ELEVENLABS_API_KEY ? 'AUDIO' : 'SCRIPT-ONLY')}\n`);
});
