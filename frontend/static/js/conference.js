/* ══════════════════════════════════════════
   Nous Round Table — Scene & Interaction
   ══════════════════════════════════════════ */

// ═══ SVG: Render table ═══
function renderTableSVG() {
  const svg = $('#mr-svg');
  if (!svg) return;
  const { cx, cy, rx, ry } = CONFIG.table;
  svg.innerHTML =
    '<rect x="2" y="2" width="796" height="416" rx="8" fill="none" stroke="rgba(0,0,0,0.03)" stroke-width="1"/>' +
    '<ellipse cx="' + (cx + 3) + '" cy="' + (cy + 4) + '" rx="' + (rx + 4) + '" ry="' + (ry + 4) + '" fill="rgba(0,0,0,0.04)"/>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="#DDD0B8" stroke="#CAB99A" stroke-width="1.5"/>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx - 14) + '" ry="' + (ry - 8) + '" fill="none" stroke="#D0C2A8" stroke-width="0.6" stroke-dasharray="3 3"/>' +
    '<line x1="' + (cx - rx + 30) + '" y1="' + (cy - 6) + '" x2="' + (cx + rx - 30) + '" y2="' + (cy + 5) + '" stroke="#D0C2A8" stroke-width="0.4" opacity="0.4"/>' +
    '<line x1="' + (cx - rx + 50) + '" y1="' + (cy + 10) + '" x2="' + (cx + rx - 40) + '" y2="' + (cy - 4) + '" stroke="#D0C2A8" stroke-width="0.3" opacity="0.3"/>' +
    '<ellipse cx="' + cx + '" cy="' + (cy - 2) + '" rx="' + rx + '" ry="' + ry + '" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" transform="translate(0,-1)"/>' +
    // Seat markers (4 circles)
    '<circle cx="400" cy="78" r="14" fill="none" stroke="#CAB99A" stroke-width="1" stroke-dasharray="3 3" opacity="0.3"/>' +
    '<circle cx="582" cy="220" r="14" fill="none" stroke="#CAB99A" stroke-width="1" stroke-dasharray="3 3" opacity="0.3"/>' +
    '<circle cx="400" cy="362" r="14" fill="none" stroke="#CAB99A" stroke-width="1" stroke-dasharray="3 3" opacity="0.3"/>' +
    '<circle cx="218" cy="220" r="14" fill="none" stroke="#CAB99A" stroke-width="1" stroke-dasharray="3 3" opacity="0.3"/>';
}

// ═══ Render Desks ═══
function renderDesks() {
  const container = $('#mr-desks');
  if (!container) return;

  CONFIG.agents.forEach(cfg => {
    const dp = CONFIG.deskPositions[cfg.id];
    if (!dp) return;
    const p = svgToPx(dp.x, dp.y);
    const ds = CONFIG.deskSize;
    const pW = ds.w * getScale().sx;
    const pH = ds.h * getScale().sy;

    let el = container.querySelector('[data-desk="' + cfg.id + '"]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'desk-area';
      el.dataset.desk = cfg.id;
      el.innerHTML =
        '<div class="desk-bg"></div>' +
        '<div class="desk-lamp">\u{1F4A1}</div>' +
        '<div class="desk-plant">\u{1F331}</div>' +
        '<div class="desk-computer"></div>' +
        '<div class="desk-name">' + cfg.label + '</div>' +
        '<div class="desk-status"></div>';
      container.appendChild(el);
    }

    el.style.left = p.px + 'px';
    el.style.top = p.py + 'px';
    el.style.width = pW + 'px';
    el.style.height = pH + 'px';

    const bg = el.querySelector('.desk-bg');
    if (bg) { bg.style.width = pW + 'px'; bg.style.height = pH + 'px'; }

    const lamp = el.querySelector('.desk-lamp');
    if (lamp) { lamp.style.right = '6px'; lamp.style.top = '4px'; }

    const plant = el.querySelector('.desk-plant');
    if (plant) { plant.style.left = '6px'; plant.style.top = '4px'; }

    const computer = el.querySelector('.desk-computer');
    if (computer) { computer.style.left = ((pW - 60) / 2) + 'px'; computer.style.top = '8px'; }

    const name = el.querySelector('.desk-name');
    if (name) { name.style.top = (pH - 28) + 'px'; }

    const status = el.querySelector('.desk-status');
    if (status) {
      const wi = state.working[cfg.id];
      if (wi && wi.status === 'working') {
        status.textContent = '\u{1F4CB} 工作中';
        status.style.top = (pH - 14) + 'px';
        status.style.color = cfg.color;
      } else {
        status.textContent = '\u2705 空闲';
        status.style.top = (pH - 14) + 'px';
        status.style.color = 'var(--text-muted)';
      }
    }
  });
}

// ═══ Walk Animation ═══
function walkTo(agentId, targetSvgX, targetSvgY, duration, callback) {
  const el = document.querySelector('[data-agent="' + agentId + '"]');
  if (!el) { if (callback) callback(); return; }

  const s = getScale();
  const curLeft = parseFloat(el.style.left) || 0;
  const curTop = parseFloat(el.style.top) || 0;
  const startSvgX = (curLeft + 21) / s.sx;
  const startSvgY = (curTop + 62) / s.sy;
  const endPx = targetSvgX * s.sx - 21;
  const endPy = targetSvgY * s.sy - 62;

  state.walking[agentId] = true;

  const startTime = performance.now();

  function frame(time) {
    const t = Math.min((time - startTime) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    el.style.left = (curLeft + (endPx - curLeft) * ease) + 'px';
    el.style.top = (curTop + (endPy - curTop) * ease) + 'px';

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      el.style.left = endPx + 'px';
      el.style.top = endPy + 'px';
      state.agentPositions[agentId] = { x: targetSvgX, y: targetSvgY };
      delete state.walking[agentId];
      if (callback) callback();
    }
  }
  requestAnimationFrame(frame);
}

// ═══ Characters ═══
function initAgentPositions() {
  CONFIG.agents.forEach(cfg => {
    const home = CONFIG.homePositions[cfg.id];
    state.agentPositions[cfg.id] = { x: home.x, y: home.y };
  });
}

function renderCharacters() {
  const container = $('#mr-characters');
  if (!container) return;
  const s = getScale();

  CONFIG.agents.forEach(cfg => {
    const pos = state.agentPositions[cfg.id] || CONFIG.homePositions[cfg.id];
    const px = pos.x * s.sx - 21;
    const py = pos.y * s.sy - 62;

    let el = container.querySelector('[data-agent="' + cfg.id + '"]');
    const isNew = !el;
    if (isNew) {
      el = document.createElement('div');
      el.className = 'mr-agent';
      el.dataset.agent = cfg.id;
      el.title = cfg.label + ' (' + cfg.role + ')';
      el.innerHTML =
        '<div class="mr-agent-body">' +
          '<div class="mr-agent-avatar" style="background:' + cfg.color + '">' +
            '<span>' + cfg.emoji + '</span>' +
            '<div class="mr-agent-status online"></div>' +
          '</div>' +
          '<div class="mr-agent-name">' + cfg.label + '</div>' +
        '</div>';

      el.addEventListener('click', function(e) {
        e.stopPropagation();
        handleAgentClick(cfg.id, e);
      });
      container.appendChild(el);
      // Initial: no transition, direct position
      el.style.left = px + 'px';
      el.style.top = py + 'px';
    } else {
      if (!state.walking[cfg.id]) {
        el.style.left = px + 'px';
        el.style.top = py + 'px';
      }
      // Update status dot
      const avatar = el.querySelector('.mr-agent-avatar');
      if (avatar) {
        const dot = avatar.querySelector('.mr-agent-status');
        if (dot) {
          const apiAgent = state.agents.find(a => a.agent_id === cfg.id);
          const hbStatus = apiAgent ? (apiAgent.heartbeat_status || 'gray') : 'gray';
          dot.className = 'mr-agent-status ' + (hbStatus === 'green' || !apiAgent ? 'online' : (hbStatus === 'yellow' ? 'warn' : 'offline'));
        }
      }
    }

    // Chat badge (if chatting)
    const existingBadge = el.querySelector('.mr-chat-badge');
    const wi = state.working[cfg.id];
    if (wi && wi.status === 'working') {
      const task = state.tasks.find(t => t.id === wi.taskId);
      const label = task ? (task.title || task.id).substring(0, 12) : wi.taskId;
      if (!existingBadge) {
        const badge = document.createElement('div');
        badge.className = 'mr-chat-badge';
        badge.textContent = '\u{1F4CB} ' + label;
        el.querySelector('.mr-agent-body').appendChild(badge);
      } else if (existingBadge.textContent !== '\u{1F4CB} ' + label) {
        existingBadge.textContent = '\u{1F4CB} ' + label;
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }
  });
}

// ═══ Popup System ═══
function hidePopup() {
  const popup = $('#mr-popup');
  if (popup) { popup.style.display = 'none'; }
  state.popupAgent = null;
  state.popupTask = null;
}

function showPopup(svgX, svgY, html) {
  const popup = $('#mr-popup');
  if (!popup) return;
  const p = svgToPx(svgX, svgY);
  popup.style.display = 'block';
  popup.style.left = p.px + 'px';
  popup.style.top = (p.py - 10) + 'px';
  popup.innerHTML = '<div class="popup-box">' + html + '</div>';
}

// ═══ Task Click: Assign to Agent ═══
function handleTaskClick(taskId, event) {
  event.stopPropagation();
  hidePopup();

  const assigned = Object.entries(state.working).find(([_, w]) => w.taskId === taskId && w.status === 'working');
  if (assigned) return;

  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const btnHtml = CONFIG.agents.map(a => {
    const busy = state.working[a.id] && state.working[a.id].status === 'working';
    return '<div class="popup-btn" onclick="assignTask(\'' + taskId + '\',\'' + a.id + '\')" style="' + (busy ? 'opacity:0.4;pointer-events:none' : '') + '">' +
      '<span class="popup-dot" style="background:' + a.color + '"></span>' +
      '<span class="popup-emoji">' + a.emoji + '</span>' +
      '<span>' + a.label + '</span>' +
      (busy ? '<span style="margin-left:auto;font-size:0.55rem;color:var(--text-muted)">工作中</span>' : '') +
    '</div>';
  }).join('');

  showPopup(CONFIG.tableTarget.x, CONFIG.tableTarget.y - 50,
    '<div class="popup-title">\u{1F4DD} 谁要认领此任务？</div>' +
    btnHtml +
    '<div class="popup-cancel" onclick="hidePopup()">取消</div>'
  );
  state.popupTask = taskId;
}

// ═══ Assign Task ═══
window.assignTask = function(taskId, agentId) {
  hidePopup();
  if (state.working[agentId] && state.working[agentId].status === 'working') return;
  if (state.walking[agentId]) return;

  state.working[agentId] = { taskId: taskId, status: 'working' };

  renderMeetingRoomTasks();
  renderAgenda();
  renderDesks();

  const home = CONFIG.homePositions[agentId];
  const tableTarget = CONFIG.tableTarget;
  const desk = CONFIG.deskAgentPos[agentId];

  // Walk from seat to table (slowly)
  const targetPos = state.agentPositions[agentId] || home;
  walkTo(agentId, tableTarget.x, tableTarget.y, 4000, function() {
    // Walk from table to desk
    walkTo(agentId, desk.x, desk.y, 3500, function() {
      renderCharacters();
    });
  });
};

// ═══ Return Task ═══
window.returnTask = function(agentId) {
  hidePopup();
  if (!state.working[agentId] || state.working[agentId].status !== 'working') return;
  if (state.walking[agentId]) return;

  const taskId = state.working[agentId].taskId;
  const tableTarget = CONFIG.tableTarget;
  const home = CONFIG.homePositions[agentId];

  // Walk from desk to table
  const desk = CONFIG.deskAgentPos[agentId];
  walkTo(agentId, tableTarget.x, tableTarget.y, 4000, function() {
    // Place task as done
    delete state.working[agentId];
    var st = null;
    (state.blackboardTasks || []).forEach(function(t) {
      if (t.subtasks) {
        t.subtasks.forEach(function(s) {
          if (s.id === taskId) { st = s; s.status = 'done'; }
        });
      }
    });

    // Walk back to seat
    walkTo(agentId, home.x, home.y, 3500, function() {
      renderCharacters();
      renderMeetingRoomTasks();
      renderAgenda();
      renderArchive();
      renderDesks();
    });
  });
};

// ═══ Agent Click ═══
function handleAgentClick(agentId, event) {
  event.stopPropagation();
  hidePopup();

  const pos = state.agentPositions[agentId] || CONFIG.homePositions[agentId];
  const wi = state.working[agentId];
  const cfg = getAgentCfg(agentId);

  let btns = '';
  if (wi && wi.status === 'working') {
    btns += '<div class="popup-btn" onclick="returnTask(\'' + agentId + '\')">' +
      '<span class="popup-dot" style="background:' + (cfg ? cfg.color : '#8A7A70') + '"></span>' +
      '<span>\u{1F4E6} 交出成果</span>' +
    '</div>';
  }

  const others = CONFIG.agents.filter(a => a.id !== agentId);
  others.forEach(other => {
    btns += '<div class="popup-btn" onclick="startChat(\'' + agentId + '\',\'' + other.id + '\')">' +
      '<span class="popup-dot" style="background:' + other.color + '"></span>' +
      '<span class="popup-emoji">' + other.emoji + '</span>' +
      '<span>找 ' + other.label + ' 聊聊</span>' +
    '</div>';
  });

  if (!btns) {
    btns = '<div style="font-size:0.75rem;color:var(--text-muted);padding:5px">暂时无事</div>';
  }

  showPopup(pos.x, pos.y - 60,
    '<div class="popup-title">' + (cfg ? cfg.label : agentId) + ' \u2014 操作</div>' +
    btns +
    '<div class="popup-cancel" onclick="hidePopup()">取消</div>'
  );
}

// ═══ Chat ═══
window.startChat = function(fromId, toId) {
  hidePopup();
  if (state.walking[fromId]) return;

  const toPos = state.agentPositions[toId] || CONFIG.homePositions[toId];
  const fromPos = state.agentPositions[fromId] || CONFIG.homePositions[fromId];

  // Walk to near the other agent
  const dirX = toPos.x > fromPos.x ? 1 : -1;
  const dirY = toPos.y > fromPos.y ? 1 : -1;
  const chatTarget = { x: toPos.x + dirX * 50, y: toPos.y + dirY * 40 };
  // Clamp to scene bounds
  chatTarget.x = Math.min(760, Math.max(40, chatTarget.x));
  chatTarget.y = Math.min(400, Math.max(40, chatTarget.y));

  walkTo(fromId, chatTarget.x, chatTarget.y, 4000, function() {
    setTimeout(function() {
      walkTo(fromId, fromPos.x, fromPos.y, 3500, function() {
        renderCharacters();
      });
    }, 3000);
  });
};

// Click outside popup
document.addEventListener('click', function(e) {
  const popup = $('#mr-popup');
  if (popup && popup.style.display !== 'none' &&
      !e.target.closest('.popup-box') &&
      !e.target.closest('.mr-task-indicator') &&
      !e.target.closest('.mr-agent')) {
    hidePopup();
  }
});

// ═══ Blackboard (黑板 = 任务表 pending/processing) ═══
function renderBlackboard() {
  var container = $('#blackboard-content');
  if (!container) return;
  var tasks = state.blackboardTasks || [];
  if (!tasks.length) {
    container.innerHTML = '<div class="blackboard-empty">暂无任务 &mdash; 黑板为空</div>';
    return;
  }
  var STATUS_LABELS = { pending: '待处理', processing: '执行中' };
  container.innerHTML = tasks.map(function(t) {
    var color = t.status === 'processing' ? '#C4A97D' : '#8A7A70';
    var label = STATUS_LABELS[t.status] || t.status;
    return '<div class="bb-item" style="border-left-color:' + color + '">' +
      '<span class="bb-ts">' + formatTime(t.created_at) + '</span>' +
      '<span class="bb-tag" style="background:' + color + ';color:#fff">' + label + '</span>' +
      '<span class="bb-text"><strong>' + escapeHtml((t.title || '').substring(0, 50)) + '</strong></span>' +
      (t.subtasks && t.subtasks.length ? '<span class="bb-from">' + t.subtasks.length + ' 个子任务</span>' : '') +
    '</div>';
  }).join('');
}

// Signal Detail Modal
window.showSignalDetail = function(idx) {
  const sig = state.signals[idx];
  if (!sig) return;
  const color = CONFIG.signalColors[sig.signal_type] || '#8A7A70';
  const label = CONFIG.signalLabels[sig.signal_type] || sig.signal_type;
  const fromLabel = getAgentDisplay(sig.from_agent);
  const toLabel = sig.to_agent ? getAgentDisplay(sig.to_agent) : null;
  const content = sig.content || '';
  const detail = sig.detail || '';
  const fullTime = sig.created_at ?
    new Date(sig.created_at + 'Z').toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) : '\u2014';

  const html =
    '<div class="modal-overlay" onclick="closeModal()">' +
    '<div class="modal" onclick="event.stopPropagation()" style="max-width:480px">' +
      '<div class="modal-header" style="border-left:4px solid ' + color + '">' +
        '<div><span class="modal-title" style="font-size:0.85rem">' +
          '<span class="bb-tag" style="background:' + color + ';color:#fff;font-size:0.6rem;padding:2px 8px;border-radius:6px;margin-right:8px">' + label + '</span>' +
          escapeHtml(content.substring(0, 40)) + '</span></div>' +
        '<button class="modal-close" onclick="closeModal()">\u2715</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="modal-section">' +
          '<div class="modal-section-title">信号详情</div>' +
          '<div class="modal-info-grid">' +
            '<div class="modal-info-item"><span class="modal-info-label">发送者</span><span class="modal-info-value" style="color:' + getAgentColor(sig.from_agent) + '">' + escapeHtml(fromLabel) + '</span></div>' +
            (toLabel ? '<div class="modal-info-item"><span class="modal-info-label">接收者</span><span class="modal-info-value">' + escapeHtml(toLabel) + '</span></div>' : '') +
            '<div class="modal-info-item"><span class="modal-info-label">类型</span><span class="modal-info-value">' + sig.signal_type + '</span></div>' +
            '<div class="modal-info-item"><span class="modal-info-label">时间</span><span class="modal-info-value" style="font-family:var(--font-mono);font-size:0.72rem">' + fullTime + '</span></div>' +
          '</div>' +
        '</div>' +
        (content ? '<div class="modal-section">' +
          '<div class="modal-section-title">内容</div>' +
          '<div style="font-size:0.8rem;line-height:1.6;color:var(--text);background:var(--surface-alt);padding:10px 12px;border-radius:8px;white-space:pre-wrap;word-break:break-word">' + escapeHtml(content) + '</div>' +
        '</div>' : '') +
        (detail ? '<div class="modal-section">' +
          '<div class="modal-section-title">详细信息</div>' +
          '<div style="font-size:0.75rem;color:var(--text-secondary);background:var(--surface-alt);padding:8px 12px;border-radius:8px;white-space:pre-wrap;word-break:break-word">' + escapeHtml(detail) + '</div>' +
        '</div>' : '') +
      '</div>' +
    '</div></div>';

  const div = document.createElement('div');
  div.id = 'modal-container';
  div.innerHTML = html;
  document.body.appendChild(div);
};

window.closeModal = function() {
  const el = document.getElementById('modal-container');
  if (el) el.remove();
};

// ═══ Meeting Room Tasks (议事桌上的任务卡) ═══
function renderMeetingRoomTasks() {
  var container = $('#mr-tasks');
  if (!container) return;

  var tasks = state.blackboardTasks || [];
  if (!tasks.length) {
    container.innerHTML = '';
    return;
  }

  var s = getScale();
  var cx = CONFIG.table.cx, cy = CONFIG.table.cy, rx = CONFIG.table.rx, ry = CONFIG.table.ry;

  container.innerHTML = tasks.map(function(t, i) {
    var angle = i * 0.9 + 0.2;
    var radiusPct = 0.35 + Math.min(i * 0.06, 0.5);
    var tx = cx + (rx * radiusPct) * Math.cos(angle);
    var ty = cy + (ry * radiusPct) * Math.sin(angle);
    var p = svgToPx(tx, ty);
    var color = t.status === 'processing' ? '#C4A97D' : '#8A7A70';
    return '<div class="mr-task-indicator" style="left:' + (p.px - 65) + 'px;top:' + (p.py - 10) + 'px;border-left-color:' + color + '">' +
      '<span class="mr-task-dot" style="background:' + color + '"></span>' +
      escapeHtml((t.title || t.id).substring(0, 16)) +
    '</div>';
  }).join('');
}

// ═══ Agenda (议程 — 基于黑板上任务和子任务) ═══
function renderAgenda() {
  var container = $('#agenda-items');
  var count = $('#agenda-count');
  if (!container) return;

  var tasks = state.blackboardTasks || [];
  // 收集所有活跃的子任务
  var activeItems = [];
  tasks.forEach(function(t) {
    if (t.subtasks) {
      t.subtasks.forEach(function(st) {
        activeItems.push({
          id: st.id,
          title: st.name,
          status: st.status,
          assignee: st.assignee,
          parentTaskId: t.id,
          parentTitle: t.title,
        });
      });
    }
  });

  if (count) count.textContent = activeItems.length + ' items';

  if (!activeItems.length) {
    container.innerHTML = '<div class="agenda-empty">当下无事，诸君可歇</div>';
    return;
  }

  var STATUS_LABELS = { pending: '待认领', in_progress: '进行中', done: '已完成' };

  container.innerHTML = activeItems.map(function(st) {
    var color = st.status === 'in_progress' ? '#C4A97D' : (st.status === 'done' ? '#6B7F5E' : '#8A7A70');
    var label = STATUS_LABELS[st.status] || st.status;
    var cfg = getAgentCfg(st.assignee);
    var resultHtml = '';
    if (st.result && (st.status === 'done' || st.status === 'in_progress')) {
      var snippet = st.result.length > 60 ? st.result.substring(0, 60) + '...' : st.result;
      resultHtml = '<div class="agenda-item-result">' + escapeHtml(snippet) + '</div>';
    }
    return '<div class="agenda-item">' +
      '<span class="agenda-status-dot" style="background:' + color + '"></span>' +
      '<span class="agenda-item-title">' + escapeHtml(st.title) + '</span>' +
      '<span class="agenda-item-assignee">' + (cfg ? cfg.emoji + ' ' : '') + escapeHtml(st.assignee || '—') + '</span>' +
      '<span class="agenda-item-status" style="color:' + color + '">' + label + '</span>' +
      resultHtml +
    '</div>';
  }).join('');
}

// ═══ Archive (档案柜 — 已完成归档任务，只增不减) ═══
function renderArchive() {
  var body = $('#archive-body');
  if (!body) return;
  var archived = state.archivedTasks || [];
  if (!archived.length) {
    body.innerHTML =
      '<div class="archive-empty">' +
        '<span class="icon">🖇</span>' +
        '档案库为空<br>已完成的任务将归档于此' +
      '</div>';
    return;
  }
  body.innerHTML = archived.map(function(t) {
    var color = '#6B7F5E';
    var subtaskCount = t.subtasks ? t.subtasks.length : 0;
    return '<div class="archive-item" style="border-left-color:' + color + '" onclick="selectArchiveTask(\'' + t.id + '\')">' +
      '<div class="archive-item-title">' + escapeHtml(t.title || t.id) + '</div>' +
      '<div class="archive-item-meta">' +
        '<span style="color:' + color + '">已完成</span>' +
        '<span>' + subtaskCount + ' 子任务</span>' +
        '<span class="archive-item-tag" style="background:' + color + '20;color:' + color + '">' + escapeHtml(t.id) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

window.selectArchiveTask = function(taskId) {
  state.selectedArchiveId = taskId;
  renderArchive();
  renderArchiveDetail(taskId);
};

function renderArchiveDetail(taskId) {
  var panel = $('#archive-detail');
  var timeline = $('#detail-timeline');
  var label = $('#detail-id');
  if (!panel || !timeline) return;
  var task = (state.archivedTasks || []).find(function(t) { return t.id === taskId; });
  if (!task) { panel.classList.remove('open'); return; }
  panel.classList.add('open');
  if (label) label.textContent = task.id;

  var subs = task.subtasks || [];
  if (!subs.length) {
    timeline.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.7rem">无子任务记录</div>';
    return;
  }
  var STATUS_ICONS = { pending: '⏳', in_progress: '▶', done: '✅' };
  timeline.innerHTML = subs.map(function(st) {
    var icon = STATUS_ICONS[st.status] || '📋';
    var cfg = getAgentCfg(st.assignee);
    var dotColor = st.status === 'done' ? '#6B7F5E' : (st.status === 'in_progress' ? '#C4A97D' : '#8A7A70');
    var resultBlock = '';
    if (st.result) {
      resultBlock = '<div class="detail-event-result" style="margin-top:6px;padding:8px 10px;background:rgba(107,127,94,0.08);border-left:3px solid ' + dotColor + ';border-radius:4px;font-size:0.7rem;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap;word-break:break-word;max-width:100%;overflow-x:auto;">' + escapeHtml(st.result) + '</div>';
    }
    return '<div class="detail-event">' +
      '<div class="detail-event-dot" style="background:' + dotColor + ';border-color:' + dotColor + '"></div>' +
      '<div>' +
        '<div class="detail-event-type">' + icon + ' ' + escapeHtml(st.name) + '</div>' +
        '<div class="detail-event-meta">' +
          '<span class="detail-event-agent">' + escapeHtml(cfg ? cfg.label : (st.assignee || '—')) + '</span>' +
          '<span>' + (st.status === 'done' ? '已完成' : st.status === 'in_progress' ? '进行中' : '待处理') + '</span>' +
        '</div>' +
        resultBlock +
      '</div>' +
    '</div>';
  }).join('');
}

window.showAgentDetail = function(agentId) {
  const apiAgent = state.agents.find(a => a.agent_id === agentId);
  const cfg = getAgentCfg(agentId);
  const label = cfg ? cfg.label : getAgentDisplay(agentId);
  const role = cfg ? cfg.role : (apiAgent ? apiAgent.role : '');
  const color = cfg ? cfg.color : getAgentColor(agentId);

  var signals = state.signals.filter(function(s) { return s.from_agent === agentId || s.to_agent === agentId; });
  var agentSubTasks = [];
  (state.blackboardTasks || []).forEach(function(t) {
    if (t.subtasks) {
      t.subtasks.forEach(function(st) {
        if (st.assignee === agentId) agentSubTasks.push(st);
      });
    }
  });

  const html =
    '<div class="modal-overlay" onclick="closeModal()">' +
    '<div class="modal" onclick="event.stopPropagation()">' +
      '<div class="modal-header" style="border-left:4px solid ' + color + '">' +
        '<div><span class="modal-title">' + label + '</span><span class="modal-role">' + role + '</span></div>' +
        '<button class="modal-close" onclick="closeModal()">\u2715</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="modal-section">' +
          '<div class="modal-section-title">个人信息</div>' +
          '<div class="modal-info-grid">' +
            '<div class="modal-info-item"><span class="modal-info-label">状态</span><span class="modal-info-value">' + (apiAgent ? apiAgent.status : 'unknown') + '</span></div>' +
            '<div class="modal-info-item"><span class="modal-info-label">信号</span><span class="modal-info-value">' + signals.length + ' 条</span></div>' +
            '<div class="modal-info-item"><span class="modal-info-label">任务</span><span class="modal-info-value">' + agentSubTasks.length + ' 个</span></div>' +
          '</div>' +
        '</div>' +
        (signals.length ? '<div class="modal-section">' +
          '<div class="modal-section-title">相关信号</div>' +
          signals.slice(-5).reverse().map(s => {
            const sc = CONFIG.signalColors[s.signal_type] || '#8A7A70';
            return '<div class="modal-signal"><span class="modal-signal-dot" style="background:' + sc + '"></span><span>' + escapeHtml((s.content || '').substring(0, 30)) + '</span></div>';
          }).join('') +
        '</div>' : '') +
      '</div>' +
    '</div></div>';

  const div = document.createElement('div');
  div.id = 'modal-container';
  div.innerHTML = html;
  document.body.appendChild(div);
};
