/* ── DOM refs ─────────────────────────────────────────── */
const inputSection   = document.getElementById('input-section');
const loadingSection = document.getElementById('loading-section');
const resultSection  = document.getElementById('result-section');
const errorSection   = document.getElementById('error-section');

const todoList    = document.getElementById('todo-list');
const addRowBtn   = document.getElementById('add-row-btn');
const generateBtn = document.getElementById('generate-btn');

const loadingMsg  = document.getElementById('loading-msg');
const loadingBar  = document.getElementById('loading-bar');
const loadingStep = document.getElementById('loading-step');

const videoWrap   = document.getElementById('video-wrap');
const audioWrap   = document.getElementById('audio-wrap');
const resultVideo = document.getElementById('result-video');
const resultAudio = document.getElementById('result-audio');
const audioPulse  = document.getElementById('audio-pulse');
const scriptText  = document.getElementById('script-text');

const resetBtn    = document.getElementById('reset-btn');
const retryBtn    = document.getElementById('retry-btn');
const errorMsg    = document.getElementById('error-msg');

/* ── Row management ───────────────────────────────────── */

function renumberRows() {
  todoList.querySelectorAll('.todo-row').forEach((row, i) => {
    row.querySelector('.todo-num').textContent = String(i + 1).padStart(2, '0');
  });
}

function addRow(value = '') {
  const count = todoList.querySelectorAll('.todo-row').length;
  if (count >= 20) return;

  const row = document.createElement('div');
  row.className = 'todo-row';

  row.innerHTML = `
    <span class="todo-num">${String(count + 1).padStart(2, '0')}</span>
    <input type="text" class="todo-input" placeholder="To-do item…" maxlength="120" autocomplete="off" value="${escapeAttr(value)}" />
    <button class="remove-row" aria-label="Remove" tabindex="-1">✕</button>
  `;

  row.querySelector('.remove-row').addEventListener('click', () => {
    if (todoList.querySelectorAll('.todo-row').length > 1) {
      row.remove();
      renumberRows();
    }
  });

  row.querySelector('.todo-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRow();
      todoList.lastElementChild.querySelector('.todo-input').focus();
    }
  });

  todoList.appendChild(row);
  if (value === '') row.querySelector('.todo-input').focus();
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wire existing first row's remove + enter
todoList.querySelector('.remove-row').addEventListener('click', () => {
  if (todoList.querySelectorAll('.todo-row').length > 1) {
    todoList.querySelector('.todo-row').remove();
    renumberRows();
  }
});
todoList.querySelector('.todo-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addRow(); todoList.lastElementChild.querySelector('.todo-input').focus(); }
});

addRowBtn.addEventListener('click', () => addRow());

/* ── Section switching ────────────────────────────────── */

function showSection(id) {
  [inputSection, loadingSection, resultSection, errorSection].forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

/* ── Loading state helpers ────────────────────────────── */

const STEP_CONFIG = {
  init:   { label: 'Initiating contact…',               pct: 5,  step: '— / 3' },
  script: { label: 'Mike is assessing the situation…',  pct: 25, step: 'STEP 1 / 3' },
  audio:  { label: 'Mike is clearing his throat…',      pct: 55, step: 'STEP 2 / 3' },
  video:  { label: 'Mike is adjusting his tie…',        pct: 75, step: 'STEP 3 / 3' },
  done:   { label: 'Orders ready. Don\'t be late.',     pct: 100, step: 'COMPLETE' },
};

function updateLoading(step) {
  const cfg = STEP_CONFIG[step] || STEP_CONFIG.init;
  loadingMsg.textContent  = cfg.label;
  loadingBar.style.width  = cfg.pct + '%';
  loadingStep.textContent = cfg.step;
}

/* ── Typewriter effect ────────────────────────────────── */

function typewrite(el, text, speed = 28) {
  el.textContent = '';
  let i = 0;
  const tick = () => {
    el.textContent += text[i++];
    if (i < text.length) setTimeout(tick, speed);
  };
  tick();
}

/* ── Generate flow ────────────────────────────────────── */

let pollInterval = null;

async function startGenerate() {
  const inputs = [...todoList.querySelectorAll('.todo-input')];
  const todos  = inputs.map(i => i.value.trim()).filter(Boolean);

  if (todos.length === 0) {
    inputs[0].focus();
    inputs[0].style.borderColor = 'var(--danger)';
    setTimeout(() => { inputs[0].style.borderColor = ''; }, 1500);
    return;
  }

  generateBtn.disabled = true;
  showSection('loading-section');
  updateLoading('init');

  try {
    const res = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ todos }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error');
    }

    const { jobId } = await res.json();
    pollJob(jobId);

  } catch (err) {
    showError(err.message);
  }
}

function pollJob(jobId) {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${jobId}`);
      if (!res.ok) throw new Error('Status check failed');

      const job = await res.json();

      if (job.stepLabel) loadingMsg.textContent = job.stepLabel;
      if (job.step && STEP_CONFIG[job.step]) updateLoading(job.step);

      if (job.status === 'done') {
        clearInterval(pollInterval);
        updateLoading('done');
        setTimeout(() => showResult(job), 600);
      } else if (job.status === 'error') {
        clearInterval(pollInterval);
        showError(job.error || 'Unknown error');
      }
    } catch (err) {
      clearInterval(pollInterval);
      showError(err.message);
    }
  }, 2000);
}

/* ── Show result ──────────────────────────────────────── */

function showResult(job) {
  showSection('result-section');

  // Script
  if (job.script) typewrite(scriptText, job.script, 22);

  if (job.videoUrl) {
    videoWrap.classList.remove('hidden');
    audioWrap.classList.add('hidden');
    resultVideo.src = job.videoUrl;
    resultVideo.play().catch(() => {});
  } else if (job.audioUrl) {
    audioWrap.classList.remove('hidden');
    videoWrap.classList.add('hidden');
    resultAudio.src = job.audioUrl;
    resultAudio.play().catch(() => {});

    // Show pulse bars while playing
    resultAudio.addEventListener('play',  () => audioPulse.classList.remove('hidden'));
    resultAudio.addEventListener('pause', () => audioPulse.classList.add('hidden'));
    resultAudio.addEventListener('ended', () => audioPulse.classList.add('hidden'));
  } else {
    // Script-only fallback
    videoWrap.classList.add('hidden');
    audioWrap.classList.add('hidden');
  }
}

/* ── Error ────────────────────────────────────────────── */

function showError(msg) {
  generateBtn.disabled = false;
  showSection('error-section');
  errorMsg.textContent = msg;
}

/* ── Reset / retry ────────────────────────────────────── */

function reset() {
  generateBtn.disabled = false;
  if (pollInterval) clearInterval(pollInterval);
  resultVideo.pause();
  resultVideo.src = '';
  resultAudio.pause();
  resultAudio.src = '';
  audioPulse.classList.add('hidden');
  videoWrap.classList.add('hidden');
  audioWrap.classList.add('hidden');
  scriptText.textContent = '';
  showSection('input-section');
}

resetBtn.addEventListener('click', reset);
retryBtn.addEventListener('click', reset);
generateBtn.addEventListener('click', startGenerate);
