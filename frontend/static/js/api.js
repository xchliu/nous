/* ══════════════════════════════════════════
   Nous Round Table — Data Fetch & Init
   ══════════════════════════════════════════ */

let refreshTimer = null;

// ═══ API helpers with mock fallback ═══

function fetchSignals() {
  return nousFetch('/api/signals?limit=50')
    .then(function(d) { return d.signals || d.data || d; })
    .catch(function() { return getMockSignals(); });
}

// 黑板 = 任务表 (status=pending,processing)
function fetchBlackboardTasks() {
  return nousFetch('/api/tasks?status=pending,processing')
    .then(function(d) { return d.tasks || d.data || d; })
    .catch(function() { return []; });
}

// 所有任务
function fetchTasks(status) {
  var path = '/api/tasks';
  if (status) path += '?status=' + encodeURIComponent(status);
  return nousFetch(path)
    .then(function(d) { return d.tasks || d.data || d; })
    .catch(function() { return getMockTasks(); });
}

// 创建任务 (从信号消费)
function createTask(data) {
  return nousFetch('/api/tasks', { method: 'POST', body: data })
    .then(function(d) { return d.task || d; })
    .catch(function() { return null; });
}

function updateTaskStatus(id, data) {
  return nousFetch('/api/tasks/' + encodeURIComponent(id), { method: 'PATCH', body: data })
    .then(function(d) { return d; })
    .catch(function() { return null; });
}

// 子任务
function fetchSubTasks(taskId) {
  return nousFetch('/api/tasks/' + encodeURIComponent(taskId) + '/subtasks')
    .then(function(d) { return d.subtasks || []; })
    .catch(function() { return []; });
}

function createSubTasks(taskId, subtasks) {
  return nousFetch('/api/tasks/' + encodeURIComponent(taskId) + '/subtasks', {
    method: 'POST',
    body: { subtasks: subtasks },
  })
    .then(function(d) { return d; })
    .catch(function() { return null; });
}

function updateSubTask(subtaskId, data) {
  return nousFetch('/api/subtasks/' + encodeURIComponent(subtaskId), {
    method: 'PATCH',
    body: data,
  })
    .then(function(d) { return d; })
    .catch(function() { return null; });
}

// 归档
function archiveTask(taskId) {
  return nousFetch('/api/tasks/' + encodeURIComponent(taskId) + '/archive', {
    method: 'POST',
  })
    .then(function(d) { return d; })
    .catch(function() { return null; });
}

function fetchArchivedTasks() {
  return nousFetch('/api/archived-tasks')
    .then(function(d) { return d.archived_tasks || []; })
    .catch(function() { return []; });
}

// ═══ Agent Gateway API — call agent's LLM via Nous backend proxy ═══
function callAgentGateway(agentId, systemPrompt, userMessage) {
  var gw = CONFIG.agentGateway[agentId];
  if (!gw) return Promise.reject('Unknown agent: ' + agentId);

  return nousFetch('/api/agent-gateway', {
    method: 'POST',
    timeout: 30000,
    body: {
      agent_id: agentId,
      model: gw.model,
      system_prompt: systemPrompt,
      user_message: userMessage,
      max_tokens: 400,
      temperature: 0.3,
    },
  }).then(function(data) {
    var text = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    return text;
  });
}

// 信号消费标记
function consumeSignal(signalId, taskId) {
  return nousFetch('/api/signals/' + signalId + '/consume', {
    method: 'POST',
    body: { task_id: taskId },
  })
    .then(function(d) { return d; })
    .catch(function() { return null; });
}

// ═══ Mock fallback generators ═══

function getMockSignals() {
  var now = new Date().toISOString();
  return [
    { id: 'm1', signal_type: 'HEARTBEAT', from_agent: 'socrates', content: 'Heartbeat OK', created_at: now, consumed: true },
    { id: 'm2', signal_type: 'DONE', from_agent: 'aris', content: '日常任务已完成', created_at: now, consumed: false },
    { id: 'm3', signal_type: 'ASK:arch', from_agent: 'plato', content: '新架构设计需求', created_at: now, consumed: false },
  ];
}

function getMockTasks() {
  return [];
}

// ═══ Refresh / Render loop ═══

function refreshAll() {
  Promise.all([
    nousFetch('/api/agents').then(function(d) { state.agents = d.agents || d.data || d; }).catch(function() {}),
    fetchSignals().then(function(d) { state.signals = d; }),
    fetchBlackboardTasks().then(function(d) { state.blackboardTasks = d; }),
    fetchArchivedTasks().then(function(d) { state.archivedTasks = d; }),
  ]).finally(function() {
    state.lastUpdated = new Date();
    var dot = $('#refresh-dot');
    var lu = $('#last-updated');
    if (dot) dot.className = 'refresh-dot';
    if (lu) lu.textContent = state.lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    renderAll();
  });
}

function renderAll() {
  renderBlackboard();
  renderDesks();
  renderCharacters();
  renderMeetingRoomTasks();
  renderAgenda();
  renderArchive();
}

// ═══ Init ═══
function init() {
  initAgentPositions();
  renderTableSVG();

  // Initial fetch
  refreshAll();

  // Auto-refresh
  refreshTimer = setInterval(refreshAll, CONFIG.refreshInterval);

  // Start auto workflow after first data load
  setTimeout(startWorkflow, 3000);

  // Re-render on resize
  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      renderAll();
    }, 200);
  });
}

document.addEventListener('DOMContentLoaded', init);
