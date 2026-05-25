/* ============================================
   Nous Dashboard v2 — Application Logic
   ============================================ */

// ========== Config ==========
const CONFIG = {
  NOUS_API: 'http://localhost:8600',
  NOUS_TOKEN: 'nous-admin-token-v2',
  refreshInterval: 30000,
  timeout: 5000,
  agentColors: {
    socrates: '#2563eb',
    aris: '#10b981',
    plato: '#f97316',
    grace: '#f59e0b',
  },
  signalLabels: {
    HEARTBEAT: '❤',
    DONE: '✔',
    BLOCKED: '!',
    'ASK:arch': '?',
    'ASK:impl': '?',
    SYNC: '↻',
    REPAIR: '⚡',
  },
  signalColors: {
    HEARTBEAT: '#94a3b8',
    DONE: '#22c55e',
    BLOCKED: '#ef4444',
    'ASK:arch': '#f59e0b',
    'ASK:impl': '#f59e0b',
    SYNC: '#3b82f6',
    REPAIR: '#f97316',
    STATUS: '#64748b',
  },
};

// ========== State ==========
const state = {
  agents: [],
  signals: [],
  tasks: [],
  selectedTaskId: null,
  lastUpdated: null,
};

// ========== Utilities ==========

function $(sel, ctx) { return (ctx || document).querySelector(sel); }

function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

function nousFetch(path) {
  return fetch(`${CONFIG.NOUS_API}${path}`, {
    headers: { 'Authorization': `Bearer ${CONFIG.NOUS_TOKEN}` },
    signal: AbortSignal.timeout(CONFIG.timeout),
  }).then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`));
}

function elapsed(iso) {
  if (!iso) return '';
  const sec = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'Z');
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// ========== M1: Agent Registry ==========

function renderAgentCard(a) {
  const hb = a.heartbeat_status || 'gray';
  const statusDot = hb === 'green' ? 'online' : (hb === 'yellow' ? 'warn' : 'offline');
  const color = a.color || '#3b82f6';
  return `
    <div class="agent-card ${hb === 'red' ? 'offline' : ''}">
      <div class="agent-color-bar" style="background:${color}"></div>
      <div class="agent-status-dot ${statusDot}" style="${hb === 'yellow' ? 'background:#f59e0b;box-shadow:0 0 6px rgba(245,158,11,0.4)' : ''}"></div>
      <div class="agent-info">
        <div class="agent-name">${escapeHtml(a.display_name || a.name)}</div>
        <div class="agent-role">${escapeHtml(a.role || '—')}</div>
      </div>
      <div class="agent-details">
        ${a.current_task_id ? `<span class="agent-task">${escapeHtml(a.current_task_id)}</span>` : '<span class="agent-task idle">idle</span>'}
        <span class="agent-heartbeat ${hb}">${formatTime(a.last_heartbeat)}</span>
      </div>
      <span class="agent-port">:${a.gateway_port}</span>
    </div>
  `;
}

function renderM1() {
  const el = $('#m1-body');
  if (!el) return;

  if (!state.agents.length) {
    el.innerHTML = '<div class="error-state"><div class="error-icon">!</div>No agent data</div>';
    return;
  }

  el.innerHTML = `<div class="agent-registry-grid">${state.agents.map(renderAgentCard).join('')}</div>`;
}

async function fetchM1() {
  try {
    const data = await nousFetch('/api/agents');
    state.agents = data.agents || [];
  } catch {
    state.agents = [];
  }
  renderM1();
}

// ========== M6: Signal Timeline ==========

function renderSignalNode(s) {
  const icon = CONFIG.signalLabels[s.signal_type] || '•';
  const color = CONFIG.signalColors[s.signal_type] || '#64748b';
  const fromName = state.agents.find(a => a.agent_id === s.from_agent)?.display_name || s.from_agent;
  const toName = s.to_agent ? (state.agents.find(a => a.agent_id === s.to_agent)?.display_name || s.to_agent) : null;

  let highlightClass = '';
  if (s.signal_type === 'BLOCKED') highlightClass = ' signal-highlight-red';
  else if (s.signal_type === 'REPAIR') highlightClass = ' signal-highlight-orange';

  return `
    <div class="signal-node${highlightClass}">
      <div class="signal-line"></div>
      <div class="signal-dot" style="background:${color}">${icon}</div>
      <div class="signal-content">
        <div class="signal-header">
          <span class="signal-type" style="color:${color}">${s.signal_type}</span>
          <span class="signal-from">${escapeHtml(fromName)}</span>
          ${toName ? `<span class="signal-arrow">→</span><span class="signal-to">${escapeHtml(toName)}</span>` : '<span class="signal-to">(broadcast)</span>'}
          ${s.task_id ? `<span class="signal-task">${escapeHtml(s.task_id)}</span>` : ''}
          <span class="signal-time">${formatTime(s.created_at)}</span>
        </div>
        <div class="signal-body">${escapeHtml(s.content || '')}</div>
      </div>
    </div>
  `;
}

function renderM6() {
  const el = $('#m6-body');
  if (!el) return;

  const signals = state.signals;
  if (!signals.length) {
    el.innerHTML = '<div class="event-empty">No signals recorded</div>';
    return;
  }

  el.innerHTML = `<div class="signal-timeline">${signals.map(renderSignalNode).join('')}</div>`;
}

function applySignalFilters() {
  // Re-fetch with filter params
  const typeFilter = $('#signal-type-filter').value;
  const agentFilter = $('#signal-agent-filter').value;
  let url = '/api/signals?limit=50';
  if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
  if (agentFilter) url += `&from_agent=${encodeURIComponent(agentFilter)}`;

  const countBadge = $('#signal-count-badge');

  nousFetch(url).then(data => {
    state.signals = data.signals || [];
    if (countBadge) countBadge.textContent = `${state.signals.length} signals`;
    renderM6();
  }).catch(() => {
    state.signals = [];
    renderM6();
  });
}

async function fetchM6() {
  const countBadge = $('#signal-count-badge');
  try {
    const data = await nousFetch('/api/signals?limit=50');
    state.signals = data.signals || [];
    if (countBadge) countBadge.textContent = `${state.signals.length} signals`;
  } catch {
    state.signals = [];
  }
  renderM6();
}

// ========== M2: Task Lifecycle + Events ==========

const TASK_STATUS_COLORS = {
  backlog: '#3b82f6',
  running: '#f59e0b',
  blocked: '#ef4444',
  done: '#22c55e',
  unknown: '#64748b',
};

function renderTaskCard(t) {
  const color = TASK_STATUS_COLORS[t.status] || '#64748b';
  const isBlocked = t.status === 'blocked';
  const selected = state.selectedTaskId === t.id;
  return `
    <div class="kanban-task ${isBlocked ? 'task-blocked' : ''} ${selected ? 'task-selected' : ''}"
         onclick="selectTask('${t.id}')">
      <div class="task-color-bar" style="background:${color}"></div>
      <div class="task-title">${escapeHtml(t.title)}</div>
      <div class="task-meta">
        <span class="task-assignee">${escapeHtml(t.assignee || '—')}</span>
        <span class="task-id">${escapeHtml(t.id)}</span>
        ${isBlocked ? '<span class="task-blocked-badge">BLOCKED</span>' : ''}
      </div>
    </div>
  `;
}

function renderM2() {
  const el = $('#m2-body');
  if (!el) return;

  const tasks = state.tasks;
  const columns = { backlog: [], running: [], blocked: [], done: [] };
  tasks.forEach(t => {
    const col = t.status in columns ? t.status : 'backlog';
    columns[col].push(t);
  });

  el.innerHTML = `<div class="kanban-board">${Object.entries(columns).map(([col, items]) => `
    <div class="kanban-column">
      <div class="kanban-column-header">
        <span style="color:${TASK_STATUS_COLORS[col]}">${col}</span>
        <span class="count">${items.length}</span>
      </div>
      ${items.length === 0
        ? '<div class="kanban-empty">—</div>'
        : items.map(renderTaskCard).join('')
      }
    </div>
  `).join('')}</div>`;

  // If there's a selected task, re-render its events
  if (state.selectedTaskId) {
    renderTaskEvents(state.selectedTaskId);
  }
}

function renderTaskEvents(taskId) {
  const el = $('#m2-events-body');
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) {
    el.innerHTML = '<div class="event-empty">Task not found</div>';
    return;
  }

  const label = $('#selected-task-label');
  if (label) label.textContent = task.id;

  const events = task.events || [];
  if (!events.length) {
    el.innerHTML = '<div class="event-empty">No events recorded</div>';
    return;
  }

  const EVENT_BY_TYPE = {
    created: '📋 created',
    assigned: '👤 assigned',
    claimed: '✋ claimed',
    started: '▶ started',
    blocked: '🚫 blocked',
    completed: '✅ completed',
    reviewed: '🔍 reviewed',
    accepted: '🎉 accepted',
    rejected: '❌ rejected',
    reassigned: '🔄 reassigned',
    progress: '📊 progress',
  };

  el.innerHTML = `<div class="event-flow">${events.map((e, i) => {
    const label = EVENT_BY_TYPE[e.event_type] || e.event_type;
    const agentName = e.agent_id ? (state.agents.find(a => a.agent_id === e.agent_id)?.display_name || e.agent_id) : '';
    return `
      <div class="event-item ${e.event_type === 'blocked' ? 'event-blocked' : ''}">
        <div class="event-dot" style="background:${e.event_type === 'blocked' ? '#ef4444' : e.event_type === 'completed' || e.event_type === 'accepted' ? '#22c55e' : '#3b82f6'}"></div>
        <div class="event-line"></div>
        <div class="event-info">
          <div class="event-type">${label}</div>
          <div class="event-meta">
            ${agentName ? `<span class="event-agent">${escapeHtml(agentName)}</span>` : ''}
            <span class="event-time">${formatTime(e.created_at)} (${elapsed(e.created_at)} ago)</span>
          </div>
          ${e.detail ? `<div class="event-detail">${escapeHtml(e.detail)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

window.selectTask = function(taskId) {
  state.selectedTaskId = taskId;
  renderM2(); // re-render to update selection highlight
};

async function fetchM2() {
  try {
    const data = await nousFetch('/api/tasks');
    state.tasks = data.tasks || [];
  } catch {
    state.tasks = [];
  }
  renderM2();
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

  await Promise.allSettled([
    fetchM1(),
    fetchM6(),
    fetchM2(),
  ]);
}

// ========== Init ==========

function init() {
  refreshAll();
  setInterval(refreshAll, CONFIG.refreshInterval);
}

// Start on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}