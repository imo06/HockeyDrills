// ─────────────────────────────────────────────────────────────
//  io.js  —  save / load drill JSON
// ─────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000';

// ─────────────────────────────────────────────────────────────
//  Coach identity — stored in localStorage, set via top-bar input
// ─────────────────────────────────────────────────────────────

function getCoach() {
  return (localStorage.getItem('drillLab:coach') || '').trim();
}

function initCoachField() {
  const input = document.getElementById('coach-name');
  if (!input) return;

  // Pre-fill from storage
  input.value = getCoach();

  // Persist on every change
  input.addEventListener('input', () => {
    localStorage.setItem('drillLab:coach', input.value.trim());
  });
}


// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────

function initIO() {
  initCoachField();

  document.getElementById('btn-save').addEventListener('click', saveJSON);
  document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', loadJSON);
  document.getElementById('btn-save-local').addEventListener('click', saveToServer);
  document.getElementById('btn-library').addEventListener('click', openLibrary);

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear the canvas? This cannot be undone.')) return;
    pushHistory();
    State.elements  = [];
    State.selected  = null;
    State.multiSelected.clear();
    document.getElementById('drill-title').value = '';
    document.getElementById('drill-tags').value  = '';
    document.getElementById('drill-desc').value  = '';
    pushHistory();
    updatePropsPanel();
    render();
    showToast('Canvas cleared');
  });

  pushHistory();
}


// ─────────────────────────────────────────────────────────────
//  Scene helpers
// ─────────────────────────────────────────────────────────────

function buildScene() {
  const title = document.getElementById('drill-title').value.trim();
  const tags  = document.getElementById('drill-tags').value
                  .split(';').map(t => t.trim()).filter(Boolean);
  const desc  = document.getElementById('drill-desc').value.trim();

  const scene = {
    type:    'excalidraw',
    version: 2,
    source:  'rink-draw',
    metadata: {
      title:       title || 'Untitled Drill',
      tags,
      description: desc,
      savedAt:     new Date().toISOString(),
    },
    appState: {
      viewBackgroundColor: 'transparent',
      rinkView: getRinkView(),
    },
    elements: State.elements.map(serializeElement),
    files: {},
  };

  const slug = (title || 'untitled-drill')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return { scene, slug };
}

function serializeElement(el) {
  const base = {
    id:              el.id,
    type:            toExcalidrawType(el.type),
    x:               el.x,
    y:               el.y,
    width:           el.w ?? 0,
    height:          el.h ?? 0,
    angle:           el.angle ?? 0,
    strokeColor:     el.strokeColor ?? '#e8e8e8',
    backgroundColor: el.fillColor   ?? 'transparent',
    fillStyle:       el.fillColor   ? 'solid' : 'hachure',
    strokeWidth:     el.strokeWidth ?? 2,
    roughness:       1,
    opacity:         el.opacity     ?? 100,
    seed:            Math.floor(Math.random() * 100000),
    version:         1,
    isDeleted:       false,
    groupIds:        [],
    boundElements:   null,
    link:            null,
    locked:          false,
  };

  if (el.type === 'pen') {
    base.points    = el.points.map(([x, y]) => [x - el.x, y - el.y]);
    base.lineStyle = el.lineStyle ?? 'solid';
  }
  if (el.type === 'text') {
    Object.assign(base, {
      text:          el.text       ?? '',
      fontSize:      el.fontSize   ?? 20,
      fontFamily:    1,
      textAlign:     'left',
      verticalAlign: 'top',
    });
  }
  if (el.type === 'line' || el.type === 'arrow') {
    base.points    = [[0, 0], [el.w ?? 0, el.h ?? 0]];
    base.lineStyle = el.lineStyle ?? 'solid';
  }
  if (el.type === 'player') {
    base.playerType = el.playerType ?? 'F';
    base.fontSize   = el.fontSize   ?? 32;
  }
  if (el.type === 'pylon' || el.type === 'net') {
    base.backgroundColor = el.fillColor ?? 'transparent';
    base.fillStyle       = el.fillColor ? 'solid' : 'hachure';
  }
  if (el.type === 'puck') {
    base.r = el.r ?? 12;
  }

  return base;
}

function deserializeElement(el) {
  return {
    id:          el.id ?? uid(),
    type:        fromExcalidrawType(el.type),
    playerType:  el.playerType  ?? 'F',
    fontSize:    el.fontSize    ?? (el.type === 'player' ? 32 : 20),
    lineStyle:   el.lineStyle   ?? 'solid',
    angle:       el.angle       ?? 0,
    r:           el.r           ?? 12,
    x:           el.x,
    y:           el.y,
    w:           el.width       ?? 0,
    h:           el.height      ?? 0,
    strokeColor: el.strokeColor ?? '#000000',
    fillColor:   (el.backgroundColor === 'transparent' || !el.backgroundColor)
                   ? null : el.backgroundColor,
    strokeWidth: el.strokeWidth ?? 2,
    opacity:     el.opacity     ?? 100,
    text:        el.text        ?? '',
    points:      el.points      ?? null,
  };
}

function applySceneData(data) {
  if (data.appState?.rinkView) setRinkView(data.appState.rinkView);
  if (data.metadata) {
    const m = data.metadata;
    document.getElementById('drill-title').value = m.title === 'Untitled Drill' ? '' : (m.title ?? '');
    document.getElementById('drill-tags').value  = (m.tags ?? []).join('; ');
    document.getElementById('drill-desc').value  = m.description ?? '';
  }
  State.elements = (data.elements ?? []).filter(el => !el.isDeleted).map(deserializeElement);
  State.selected = null;
  State.multiSelected.clear();
  pushHistory();
  updatePropsPanel();
  render();
}


// ─────────────────────────────────────────────────────────────
//  Save JSON — browser download (no server needed)
// ─────────────────────────────────────────────────────────────

function saveJSON() {
  const { scene, slug } = buildScene();
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${slug}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('✓ Scene exported as JSON');
}


// ─────────────────────────────────────────────────────────────
//  Load JSON — file picker (no server needed)
// ─────────────────────────────────────────────────────────────

async function loadJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    applySceneData(JSON.parse(await file.text()));
    showToast('✓ Scene loaded');
  } catch (err) {
    showToast('✗ Invalid JSON: ' + err.message, true);
  }
  e.target.value = '';
}


// ─────────────────────────────────────────────────────────────
//  Save to server  →  POST /save-drill
// ─────────────────────────────────────────────────────────────

async function saveToServer() {
  const coach = getCoach();
  if (!coach) {
    showToast('✗ Enter your coach name in the top bar first', true);
    document.getElementById('coach-name')?.focus();
    return;
  }

  const { scene } = buildScene();

  try {
    const res = await fetch(`${API_BASE}/save-drill`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ coach, scene }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const { message } = await res.json();
    showToast(`✓ ${message}`);
  } catch (err) {
    showToast('✗ Could not reach server: ' + err.message, true);
  }
}


// ─────────────────────────────────────────────────────────────
//  Library  →  GET /list-drills  (drills owned by current coach
//              show a delete button; others show load only)
// ─────────────────────────────────────────────────────────────

async function openLibrary() {
  document.getElementById('drill-library')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'drill-library';
  modal.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #1e1e2e; color: #cdd6f4;
    border-radius: 10px; padding: 24px;
    width: 560px; max-height: 72vh;
    overflow-y: auto; font-family: sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
  `;

  const closeRow = document.createElement('div');
  closeRow.style.cssText = 'margin-top:16px;display:flex;justify-content:flex-end;';
  closeRow.innerHTML = `<button id="lib-close"
    style="background:#45475a;color:#cdd6f4;border:none;border-radius:4px;
           padding:8px 18px;cursor:pointer;">Close</button>`;

  panel.innerHTML = `<h2 style="margin:0 0 16px;font-size:1.1rem;">📂 Drill Library</h2>`;
  panel.appendChild(closeRow);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  panel.querySelector('#lib-close').addEventListener('click', () => modal.remove());

  const status = Object.assign(document.createElement('p'), {
    textContent: 'Loading…',
    style: 'color:#6c7086;margin:0 0 12px;',
  });
  panel.insertBefore(status, closeRow);

  const coach = getCoach();

  let drills;
  try {
    const res = await fetch(`${API_BASE}/list-drills?coach=${encodeURIComponent(coach)}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    ({ drills } = await res.json());
  } catch (err) {
    status.textContent = '✗ Could not reach server: ' + err.message;
    return;
  }

  status.remove();

  if (drills.length === 0) {
    panel.insertBefore(
      Object.assign(document.createElement('p'), {
        textContent: 'No drills saved yet. Use 💾 Save Local to add one.',
        style: 'color:#6c7086;margin:0 0 12px;',
      }),
      closeRow
    );
    return;
  }

  drills.forEach(({ id, title, tags, saved_at, is_mine }) => {
    const card = document.createElement('div');
    card.style.cssText = `
      background: #313244; border-radius: 6px; padding: 12px 14px;
      margin-bottom: 10px;
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
    `;

    // Delete button only appears for drills this coach owns.
    // No coach names are shown anywhere in the UI.
    const deleteBtn = is_mine
      ? `<button class="lib-btn-del"
           style="background:#f38ba8;color:#1e1e2e;border:none;border-radius:4px;
                  padding:6px 10px;cursor:pointer;font-size:.85rem;"
           title="Delete your drill">✕</button>`
      : '';

    card.innerHTML = `
      <div style="min-width:0;flex:1;">
        <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${title}
        </strong>
        <span style="font-size:.8em;color:#a6adc8;">
          ${tags?.length ? tags.join(', ') + ' · ' : ''}
          ${saved_at ? new Date(saved_at).toLocaleDateString() : ''}
        </span>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button class="lib-btn-load"
          style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;
                 padding:6px 12px;cursor:pointer;font-size:.85rem;">Load</button>
        ${deleteBtn}
      </div>
    `;

    card.querySelector('.lib-btn-load').addEventListener('click', async () => {
      await loadFromServer(id, title);
      modal.remove();
    });

    card.querySelector('.lib-btn-del')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
      try {
        const res = await fetch(
          `${API_BASE}/delete-drill/${id}?coach=${encodeURIComponent(coach)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        card.remove();
        showToast(`Deleted "${title}"`);
      } catch (err) {
        showToast('✗ Could not delete: ' + err.message, true);
      }
    });

    panel.insertBefore(card, closeRow);
  });
}

async function loadFromServer(id, title) {
  try {
    const res = await fetch(`${API_BASE}/get-drill/${id}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    applySceneData(await res.json());
    showToast(`✓ Loaded: ${title}`);
  } catch (err) {
    showToast('✗ Could not load: ' + err.message, true);
  }
}
