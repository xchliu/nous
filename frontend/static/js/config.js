/* ══════════════════════════════════════════
   Nous Round Table — Config & State
   ══════════════════════════════════════════ */

const CONFIG = {
  NOUS_API: 'http://localhost:8600',
  NOUS_TOKEN: 'nous-admin-token-v2',
  refreshInterval: 30000,
  timeout: 5000,

  agents: [
    { id: 'socrates', label: '苏格拉底', role: 'PM',    color: '#B85C3A', emoji: '\u{1F9D4}' },
    { id: 'aris',     label: '小亚',     role: 'Dev',   color: '#6B7F5E', emoji: '\u{1F98A}' },
    { id: 'plato',    label: '柏拉图',   role: 'Arch',  color: '#4A6FA5', emoji: '\u{1F4D6}' },
    { id: 'tan-ge',   label: '坦哥',     role: 'Owner', color: '#C4A97D', emoji: '\u{1F451}' },
  ],

  // Agent Gateway APIs (for LLM-powered task analysis & execution)
  agentGateway: {
    socrates: { url: 'http://localhost:8642/v1/chat/completions', key: 'your-secret-key', model: 'deepseek-v4-pro' },
    aris:     { url: 'http://localhost:8643/v1/chat/completions', key: 'aris-secret',      model: 'aris' },
    plato:    { url: 'http://localhost:8645/v1/chat/completions', key: 'plato-secret',      model: 'plato' },
  },

  // SVG coordinate system (800x420)
  table: { cx: 400, cy: 220, rx: 200, ry: 110 },

  homePositions: {
    socrates: { x: 400, y: 88  },
    aris:     { x: 570, y: 220 },
    plato:    { x: 400, y: 352 },
    'tan-ge': { x: 230, y: 220 },
  },

  // Desk positions (SVG coords, top-left corner of desk)
  deskPositions: {
    socrates: { x: 50,  y: 30  },
    aris:     { x: 610, y: 30  },
    plato:    { x: 50,  y: 290 },
    'tan-ge': { x: 610, y: 290 },
  },
  deskSize: { w: 140, h: 100 },

  // Where agent stands when at desk
  deskAgentPos: {
    socrates: { x: 120, y: 100 },
    aris:     { x: 680, y: 100 },
    plato:    { x: 120, y: 360 },
    'tan-ge': { x: 680, y: 360 },
  },

  tableTarget: { x: 400, y: 200 },

  signalLabels: {
    HEARTBEAT: 'HB', DONE: 'DONE', BLOCKED: 'BLOCKED',
    'ASK:arch': 'ASK', 'ASK:impl': 'ASK',
    SYNC: 'SYNC', REPAIR: 'REPAIR', STATUS: 'STATUS',
  },
  signalColors: {
    HEARTBEAT: '#B0A89C', DONE: '#6B7F5E', BLOCKED: '#C2554A',
    'ASK:arch': '#7C5CBF', 'ASK:impl': '#7C5CBF',
    SYNC: '#8A7A70', REPAIR: '#C88A3A', STATUS: '#4A6FA5',
  },
  statusColors: {
    backlog: '#C4A97D', running: '#4A6FA5',
    blocked: '#C2554A', done: '#6B7F5E', cancelled: '#8A7A70', unknown: '#B0A89C',
  },

  // Auto workflow positions (SVG coords)
  blackboardPos: { x: 50, y: 210 },  // where Socrates stands to "read the board"
  archivePos: { x: 750, y: 210 },    // where Socrates stands to "file" completed tasks

  // ═══ Workflow timing — all values in ms, user-configurable ═══
  timing: {
    // Walk animation speeds
    walkShort: 4000,       // agent to own desk, quick return home
    walkNormal: 4500,      // standard walks: to blackboard, home, table
    walkLong: 5000,        // deliberate walks: to table for task creation, to archive

    // Interstitial waits
    readBlackboard: 3000,  // time spent "reading" the blackboard
    idleWait: 20000,       // wait before re-checking blackboard when no signals
    noSignalWait: 6000,    // wait when no actionable signal found (legacy fallback)
    beforeArchive: 2000,   // pause before archiving after all subtasks done
    beforePickup: 2000,    // pause before agent walks to table to pick up subtask
    workTimeMin: 5000,     // minimum work time at desk
    workTimeRandom: 2000,  // additional random work time (0 ~ workTimeRandom)
    afterArchive: 8000,    // wait before next cycle after archive complete
  },
};

// State
const state = {
  agents: [], signals: [], blackboardTasks: [], archivedTasks: [],
  selectedArchiveId: null, lastUpdated: null,
  agentPositions: {},
  working: {},   // agentId -> { taskId, status: 'working' }
  walking: {},   // agentId -> true
  popupAgent: null, popupTask: null,
};

// Utils
const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

function nousFetch(path, options) {
  return fetch(CONFIG.NOUS_API + path, {
    method: (options && options.method) || 'GET',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.NOUS_TOKEN,
      'Content-Type': 'application/json',
      ...((options && options.headers) || {}),
    },
    body: (options && options.body) ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options && options.timeout || CONFIG.timeout),
  }).then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status));
}

function elapsed(iso) {
  if (!iso) return '';
  const sec = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 1000);
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec / 60) + 'm';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h';
  return Math.floor(sec / 86400) + 'd';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso + 'Z');
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function getAgentColor(agentId) {
  const cfg = CONFIG.agents.find(x => x.id === agentId);
  if (cfg) return cfg.color;
  const api = state.agents.find(a => a.agent_id === agentId);
  return (api && api.color) || '#8A7A70';
}

function getAgentDisplay(agentId) {
  const api = state.agents.find(a => a.agent_id === agentId);
  return api ? (api.display_name || api.name) : agentId;
}

function getAgentCfg(agentId) {
  return CONFIG.agents.find(x => x.id === agentId);
}

// ═══ Scale helper ═══
function getScale() {
  const scene = $('#mr-scene');
  if (!scene) return { sx: 1, sy: 1 };
  const rect = scene.getBoundingClientRect();
  return { sx: rect.width / 800, sy: rect.height / 420 };
}

// SVG coordinates to pixel position for overlay
function svgToPx(svgX, svgY) {
  const s = getScale();
  return { px: svgX * s.sx, py: svgY * s.sy };
}
