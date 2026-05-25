/* ============================================
   Nous Dashboard — Application Logic
   ============================================ */

// ========== Config ==========
const CONFIG = {
  agents: [
    { id: 'socrates',  name: '苏格拉底', port: 8642, color: '#2563eb' },
    { id: 'aris',      name: '小亚',     port: 8643, color: '#10b981' },
    { id: 'plato',     name: '柏拉图',   port: 8645, color: '#f97316' },
    { id: 'grace',     name: 'Grace',    port: 8644, color: '#f59e0b' },
    { id: 'gateway',   name: 'Gateway',  port: 8000, color: '#8b5cf6' },
  ],
  selfmind: 'http://localhost:3002',
  refreshInterval: 30000,
  timeout: 5000,
  memoryAgents: [
    { id: 'hermes', name: 'Hermes', color: '#2563eb' },
    { id: 'aris',   name: 'Aris',   color: '#10b981' },
    { id: 'plato',  name: 'Plato',  color: '#f97316' },
  ],
  agentColors: {
    hermes: '#2563eb',
    aris:   '#10b981',
    plato:  '#f97316',
  },
};

// ========== State ==========
const state = {
  agents: {},
  kanban: { ready: [], running: [], blocked: [], done: [] },
  blackboards: {},
  memory: { selectedAgent: 'hermes', stats: {}, trend: [] },
  wiki: [],
  lastUpdated: null,
  loading: {},
  errors: {},
};

// ========== Utilities ==========

function $(sel, ctx) { return (ctx || document).querySelector(sel); }

function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

function fetchWithTimeout(url, timeout = CONFIG.timeout) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  return fetch(url, { signal: ac.signal })
    .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
    .finally(() => clearTimeout(timer));
}

function elapsed(timestamp) {
  if (!timestamp) return '';
  const sec = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ========== SVG Sparkline ==========

function sparkline(data, options = {}) {
  const {
    width = '100%',
    height = 40,
    color = '#3b82f6',
    fillOpacity = 0.08,
    strokeWidth = 2,
    showAxis = false,
  } = options;

  if (!data || data.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 200 ${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="100" y="${height / 2 + 4}" text-anchor="middle" fill="#64748b" font-size="11">No data</text>
    </svg>`;
  }

  const values = data.map(d => d.avg_decay ?? d);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const vw = 200;
  const vh = height;
  const pad = 2;
  const pw = vw - pad * 2;
  const ph = vh - pad * 2;

  // Build path
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * pw;
    const y = pad + ph - ((v - min) / range) * ph;
    return `${x},${y}`;
  }).join(' ');

  // Fill area path
  const firstX = pad;
  const lastX = pad + pw;
  const baseY = pad + ph;
  const fillPts = `${firstX},${baseY} ${pts} ${lastX},${baseY}`;

  // Labels
  const labelY = pad + 10;
  const labelY2 = pad + ph - 2;

  const labels = showAxis ? `
    <text x="${pad + 2}" y="${labelY}" fill="#64748b" font-size="9">${max.toFixed(2)}</text>
    <text x="${pad + 2}" y="${labelY2}" fill="#64748b" font-size="9">${min.toFixed(2)}</text>
  ` : '';

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${fillPts}" fill="${color}" fill-opacity="${fillOpacity}" />
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" />
    ${labels}
  </svg>`;
}

// ========== M1: Agent Status ==========

function renderAgentCard(agent) {
  const s = state.agents[agent.id];
  const online = s && s.status === 'ok';
  const statusClass = online ? 'online' : 'offline';
  const platform = s ? (s.platform || '—') : '—';
  return `
    <div class="agent-card ${online ? '' : 'offline'}">
      <div class="agent-color-bar" style="background:${agent.color}"></div>
      <div class="agent-status-dot ${statusClass}"></div>
      <div class="agent-info">
        <div class="agent-name">${agent.name}</div>
        <div class="agent-platform">${escapeHtml(platform)}</div>
      </div>
      <span class="agent-port">:${agent.port}</span>
    </div>
  `;
}

function renderM1() {
  const el = $('#m1-body');
  if (!el) return;
  el.innerHTML = `<div class="agent-row">${CONFIG.agents.map(renderAgentCard).join('')}</div>`;
}

async function fetchM1() {
  try {
    const data = await fetchWithTimeout(`${CONFIG.selfmind}/api/proxy/agents`);
    // Map proxy response to state.agents format: {id: {status, platform}}
    CONFIG.agents.forEach(a => {
      const agentData = data[a.id];
      state.agents[a.id] = agentData && agentData.status === 'ok' ? agentData : null;
    });
  } catch {
    CONFIG.agents.forEach(a => { state.agents[a.id] = null; });
  }
  renderM1();
}

// ========== M2: Kanban ==========

const KANBAN_STATUS_MAP = {
  'todo': 'ready',
  'ready': 'ready',
  'running': 'running',
  'blocked': 'blocked',
  'done': 'done',
};

const KANBAN_COLORS = {
  ready: '#3b82f6',
  running: '#f59e0b',
  blocked: '#ef4444',
  done: '#22c55e',
};

function renderKanbanTasks(tasks) {
  const columns = { ready: [], running: [], blocked: [], done: [] };
  (tasks || []).forEach(t => {
    const col = KANBAN_STATUS_MAP[t.status] || 'ready';
    columns[col].push(t);
  });

  return Object.entries(columns).map(([col, items]) => `
    <div class="kanban-column">
      <div class="kanban-column-header">
        <span style="color:${KANBAN_COLORS[col]}">${col}</span>
        <span class="count">${items.length}</span>
      </div>
      ${items.length === 0
        ? '<div class="kanban-empty">—</div>'
        : items.map(t => `
          <div class="kanban-task">
            <div class="task-title">${escapeHtml(t.title)}</div>
            <div class="task-meta">
              <span class="task-assignee">${escapeHtml(t.assignee || '—')}</span>
              <span>${t.created_at ? elapsed(new Date(t.created_at * 1000).toISOString()) : ''}</span>
            </div>
          </div>
        `).join('')
      }
    </div>
  `).join('');
}

function renderM2() {
  const el = $('#m2-body');
  if (!el) return;
  const { ready, running, blocked, done } = state.kanban;
  const allTasks = [...ready, ...running, ...blocked, ...done];
  el.innerHTML = `<div class="kanban-board">${renderKanbanTasks(allTasks)}</div>`;
}

async function fetchM2() {
  try {
    const data = await fetchWithTimeout(`${CONFIG.selfmind}/api/kanban/tasks`);
    const tasks = data.tasks || [];
    // Re-sort into buckets
    const buckets = { ready: [], running: [], blocked: [], done: [] };
    tasks.forEach(t => {
      const col = KANBAN_STATUS_MAP[t.status] || 'ready';
      buckets[col].push(t);
    });
    state.kanban = buckets;
  } catch {
    state.kanban = { ready: [], running: [], blocked: [], done: [] };
  }
  renderM2();
}

// ========== M3: Blackboard ==========

function renderNoticeItem(notice) {
  // Try to extract a tag from frontmatter
  const tagMatch = notice.content && notice.content.match(/^(\w+):/);
  const tag = tagMatch ? tagMatch[1] : (notice.type || 'info');
  return `<div class="notice-item"><span class="notice-tag">${escapeHtml(tag)}</span>${escapeHtml(notice.content || '')}</div>`;
}

function renderM3() {
  const el = $('#m3-body');
  if (!el) return;

  const boards = state.blackboards.boards || {};
  const entries = Object.entries(boards);

  if (entries.length === 0) {
    el.innerHTML = '<div class="notice-empty">No blackboard notices yet</div>';
    return;
  }

  el.innerHTML = `<div class="blackboard-list">${entries.map(([name, board]) => {
    const notices = board || [];
    const boardLabel = name.replace(/^for-/, '').replace('.md', '');
    return `
      <div class="board-item">
        <div class="board-item-header" onclick="toggleBlackboard(this)">
          <span class="expand-icon">▶</span>
          <span>${escapeHtml(boardLabel)}</span>
          <span style="margin-left:auto;font-size:0.7rem;color:var(--text-muted)">${notices.length} notices</span>
        </div>
        <div class="board-notices expanded">
          ${notices.length === 0
            ? '<div class="notice-empty">No notices</div>'
            : notices.map(renderNoticeItem).join('')
          }
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

window.toggleBlackboard = function(header) {
  const notices = header.nextElementSibling;
  const icon = header.querySelector('.expand-icon');
  if (notices) {
    notices.classList.toggle('expanded');
    icon.classList.toggle('expanded');
  }
};

async function fetchM3() {
  try {
    const data = await fetchWithTimeout(`${CONFIG.selfmind}/api/blackboard`);
    state.blackboards = data;
  } catch {
    state.blackboards = { boards: {} };
  }
  renderM3();
}

// ========== M4: Memory ==========

function renderMemoryTabs() {
  return CONFIG.memoryAgents.map(a => `
    <button class="memory-agent-tab ${a.id === state.memory.selectedAgent ? 'active' : ''}"
            style="${a.id === state.memory.selectedAgent ? `border-color:${a.color};color:${a.color}` : ''}"
            onclick="switchMemoryAgent('${a.id}')">
      ${a.name}
    </button>
  `).join('');
}

function renderMemoryStats(stats) {
  const levels = stats || {};
  const items = [
    { key: 'L1', label: 'Sessions', value: levels.L1?.metric ?? '—', cls: levels.L1?.status === 'ok' ? 'ok' : levels.L1?.status === 'err' ? 'err' : '' },
    { key: 'L2', label: 'MEM/USER', value: levels.L2?.metric ?? '—', cls: levels.L2?.status === 'ok' ? 'ok' : levels.L2?.status === 'err' ? 'err' : 'warn' },
    { key: 'L3', label: 'Conclusions', value: levels.L3?.metric ?? '—', cls: levels.L3?.status === 'ok' ? 'ok' : 'warn' },
    { key: 'L4', label: 'Nodes', value: levels.L4?.metric ?? '—', cls: levels.L4?.status === 'ok' ? 'ok' : 'warn' },
    { key: 'L5', label: 'Skills', value: levels.L5?.metric ?? '—', cls: levels.L5?.status === 'ok' ? 'ok' : 'warn' },
    { key: 'L6', label: 'Entities', value: levels.L6?.metric ?? '—', cls: levels.L6?.status === 'ok' ? 'ok' : 'warn' },
  ];
  return items.map(item => `
    <div class="stat-item">
      <div class="stat-value ${item.cls}">${item.value}</div>
      <div class="stat-label">${item.label}</div>
    </div>
  `).join('');
}

function renderM4() {
  const el = $('#m4-body');
  if (!el) return;

  const agent = state.memory.selectedAgent;
  const agentColor = CONFIG.agentColors[agent] || '#3b82f6';
  const stats = state.memory.stats;
  const trend = state.memory.trend || [];

  el.innerHTML = `
    <div class="memory-agent-tabs">${renderMemoryTabs()}</div>
    <div class="memory-stats-grid">${renderMemoryStats(stats)}</div>
    <div class="sparkline-container">
      <div class="sparkline-label">Decay trend <span style="color:var(--text-muted)">(7 days)</span></div>
      ${sparkline(trend, { color: agentColor, height: 48, showAxis: true })}
    </div>
  `;
}

window.switchMemoryAgent = function(agentId) {
  state.memory.selectedAgent = agentId;
  fetchM4Data().then(renderM4);
};

async function fetchM4Data() {
  const agent = state.memory.selectedAgent;
  try {
    const [stats, trend] = await Promise.allSettled([
      fetchWithTimeout(`${CONFIG.selfmind}/api/stats`),
      fetchWithTimeout(`${CONFIG.selfmind}/api/decay-trend${agent !== 'hermes' ? `?agent=${agent}` : ''}`),
    ]);
    if (stats.status === 'fulfilled') state.memory.stats = stats.value;
    if (trend.status === 'fulfilled') state.memory.trend = trend.value;
  } catch {
    // keep stale data
  }
}

async function fetchM4() {
  await fetchM4Data();
  renderM4();
}

// ========== M5: Wiki ==========

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f97316', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f59e0b',
];

function renderWiki() {
  const el = $('#m5-body');
  if (!el) return;

  const cats = state.wiki || [];

  if (cats.length === 0) {
    el.innerHTML = '<div class="wiki-empty">No wiki index available</div>';
    return;
  }

  el.innerHTML = `<div class="wiki-categories">${cats.map((cat, ci) => `
    <div>
      <div class="wiki-category-item" onclick="toggleWikiCategory(this)">
        <div class="cat-icon" style="background:${CATEGORY_COLORS[ci % CATEGORY_COLORS.length]}">
          ${escapeHtml(cat.name?.charAt(0) || '?')}
        </div>
        <span class="cat-name">${escapeHtml(cat.name || 'Unknown')}</span>
        <span class="cat-count">${(cat.documents || []).length}</span>
      </div>
      <div class="wiki-pages expanded">
        ${(cat.documents || []).map(p => `
          <div class="wiki-page-item">
            <span class="page-dot"></span>
            ${escapeHtml(p.title || p)}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')}</div>`;
}

window.toggleWikiCategory = function(item) {
  const pages = item.nextElementSibling;
  if (pages) pages.classList.toggle('expanded');
};

async function fetchM5() {
  try {
    const data = await fetchWithTimeout(`${CONFIG.selfmind}/api/wiki/index`);
    state.wiki = data.categories || [];
  } catch {
    state.wiki = [];
  }
  renderWiki();
}

// ========== Poller ==========

function updateLastUpdated() {
  const now = new Date();
  state.lastUpdated = now.toISOString();
  const el = $('#last-updated');
  if (el) el.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function refreshAll() {
  updateLastUpdated();

  // Parallel fetch all modules
  await Promise.allSettled([
    fetchM1(),
    fetchM2(),
    fetchM3(),
    fetchM4(),
    fetchM5(),
  ]);
}

// ========== Init ==========

function init() {
  // Render skeletons
  refreshAll();

  // Start polling
  setInterval(refreshAll, CONFIG.refreshInterval);
}

// Start on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}