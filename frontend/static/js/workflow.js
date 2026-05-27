/* ══════════════════════════════════════════
   Nous Round Table — Auto Workflow
   生命周期: 信号→任务(黑板)→子任务(执行计划)→全部完成→归档
   分析/执行通过 Agent Gateway API 调用对应 Agent 的 LLM
   ══════════════════════════════════════════ */

state.workflowStatus = '';
state.workflowRunning = false;
state.workflowTaskId = 0;
state.localTasks = [];
state.workflowCycle = 0;
state.processedSignalIds = [];

function setWorkflowStatus(msg) {
  state.workflowStatus = msg;
  var el = $('#wf-status');
  if (el) el.textContent = msg;
}

// ═══ Build analysis prompt for Socrates ═══
function buildAnalysisPrompt(title, description) {
  return [
    '你是苏格拉底，Nous团队的项目经理。负责分析任务、制定执行计划。',
    '',
    '分析以下任务，返回一个JSON对象（只返回JSON，不要其他内容，不要markdown代码块）：',
    '{',
    '  "domain": "frontend|backend|bugfix|data|doc|ops|feature|general",',
    '  "complexity": "simple|medium|complex",',
    '  "summary": "一句话任务摘要",',
    '  "subtaskPlan": [',
    '    {"name": "子任务名称（具体描述要做什么，而非泛泛的\'需求分析\'）", "assignee": "plato"}',
    '  ]',
    '}',
    '',
    '分配规则：架构设计/需求分析→plato，开发实现→aris。2-4个子任务，复杂任务更多。',
    '',
    '=== 任务内容 ===',
    '标题：' + title,
    '描述：' + (description || '（无）'),
  ].join('\n');
}

function parseAnalysisResult(text) {
  // 尝试提取 JSON（可能被 markdown 代码块包裹）
  var jsonStr = text;
  var m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) jsonStr = m[1].trim();
  else {
    // 尝试提取第一个 { ... } 块
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start >= 0 && end > start) jsonStr = text.substring(start, end + 1);
  }
  try {
    return JSON.parse(jsonStr);
  } catch(e) {
    return null;
  }
}

// ═══ Main workflow cycle ═══

function startWorkflow() {
  if (state.workflowRunning) return;
  state.workflowRunning = true;
  state.workflowCycle++;
  setWorkflowStatus('苏格拉底正在观察黑板...');
  socratesFetchFromBoard();
}

function socratesFetchFromBoard() {
  walkTo('socrates', CONFIG.blackboardPos.x, CONFIG.blackboardPos.y, CONFIG.timing.walkNormal, function() {
    setWorkflowStatus('📋 苏格拉底查阅黑板任务...');

    setTimeout(function() {
      // 1. 先看黑板上有无 pending 任务（与黑板显示同数据源）
      fetchBlackboardTasks().then(function(tasks) {
        state.blackboardTasks = tasks;

        var pendingTasks = (tasks || []).filter(function(t) {
          return t.status === 'pending' || t.status === 'processing';
        });

        if (pendingTasks.length > 0) {
          var task = pendingTasks[0];
          setWorkflowStatus('📋 苏格拉底取走任务: ' + (task.title || '').substring(0, 25));

          walkTo('socrates', CONFIG.tableTarget.x, CONFIG.tableTarget.y, CONFIG.timing.walkLong, function() {
            socratesAnalyzeTask(task);
          });
          return;
        }

        // 2. 无任务时，检查有无信号可转换为任务
        fetchSignals().then(function(signals) {
          state.signals = signals;

          var actionable = signals.filter(function(s) {
            return (s.signal_type === 'ASK:arch' || s.signal_type === 'ASK:impl' ||
                    s.signal_type === 'BLOCKED' || s.signal_type === 'REPAIR' ||
                    s.signal_type === 'DONE' || s.signal_type === 'SYNC' ||
                    s.signal_type === 'STATUS') &&
                   !s.consumed &&
                   state.processedSignalIds.indexOf(s.id) === -1;
          });

          var sourceSignal = actionable.length > 0 ? actionable[0] : null;

          if (sourceSignal) {
            // 防重入：取信号时立刻标记处理中，避免下一轮重复消费
            if (state.processingSignalId === sourceSignal.id) return;
            state.processingSignalId = sourceSignal.id;
            state.processedSignalIds.push(sourceSignal.id);
            var preview = (sourceSignal.content || '').substring(0, 25) || sourceSignal.signal_type;
            setWorkflowStatus('📋 从信号创建任务: ' + preview);

            walkTo('socrates', CONFIG.tableTarget.x, CONFIG.tableTarget.y, CONFIG.timing.walkLong, function() {
              socratesCreateTask(sourceSignal);
            });
          } else {
            // 3. 无任务无信号：回工位等待
            setWorkflowStatus('📋 暂无任务，苏格拉底回工位等待...');
            var home = CONFIG.homePositions['socrates'];
            walkTo('socrates', home.x, home.y, CONFIG.timing.walkNormal, function() {
              renderCharacters();
              setWorkflowStatus('⏳ 等待中，' + (CONFIG.timing.idleWait / 1000) + '秒后再看黑板...');
              state.workflowRunning = false;
              setTimeout(function() {
                startWorkflow();
              }, CONFIG.timing.idleWait);
            });
          }
        });
      });
    }, CONFIG.timing.readBlackboard);
  });
}

// Step: 苏格拉底分析任务 — 调 LLM 做真正的分析
function socratesAnalyzeTask(task) {
  var title = task.title || '';
  var desc = task.description || '';

  setWorkflowStatus('\u{1F9E0} 苏格拉底调用 LLM 分析: ' + title.substring(0, 20) + '...');

  var systemPrompt = '你是苏格拉底，Nous团队PM。收到任务后分析并拆解为执行计划。只返回JSON。';
  var userMsg = buildAnalysisPrompt(title, desc);

  callAgentGateway('socrates', systemPrompt, userMsg).then(function(rawResult) {
    var analysis = parseAnalysisResult(rawResult);

    if (!analysis || !analysis.subtaskPlan) {
      // LLM 返回格式不对，降级为默认拆解
      setWorkflowStatus('\u26A0\uFE0F 分析结果解析失败，使用默认拆解');
      analysis = {
        domain: 'general',
        complexity: 'medium',
        summary: title.substring(0, 40),
        subtaskPlan: [
          {name: '\u9700\u6C42\u5206\u6790: ' + title.substring(0, 30), assignee: 'plato'},
          {name: '\u4EE3\u7801\u5B9E\u73B0: ' + title.substring(0, 30), assignee: 'aris'},
          {name: '\u7ED3\u679C\u9A8C\u8BC1: ' + title.substring(0, 30), assignee: 'plato'},
        ],
      };
    }

    setWorkflowStatus('\u{1F4CA} \u5206\u6790\u5B8C\u6210: ' + (analysis.summary || title.substring(0, 30)) + ' (' + analysis.subtaskPlan.length + '\u4E2A\u5B50\u4EFB\u52A1)');

    // 把任务状态改为 processing
    updateTaskStatus(task.id, { status: 'processing' });

    setTimeout(function() {
      socratesSplitSubtasks(task.id, analysis);
    }, CONFIG.timing.beforePickup);
  }).catch(function(err) {
    // LLM 调用失败，降级
    setWorkflowStatus('\u26A0\uFE0F LLM调用失败(' + err + ')，使用默认拆解');
    var analysis = {
      domain: 'general', complexity: 'medium',
      summary: title.substring(0, 40),
      subtaskPlan: [
        {name: '\u9700\u6C42\u5206\u6790: ' + title.substring(0, 30), assignee: 'plato'},
        {name: '\u4EE3\u7801\u5B9E\u73B0: ' + title.substring(0, 30), assignee: 'aris'},
        {name: '\u7ED3\u679C\u9A8C\u8BC1: ' + title.substring(0, 30), assignee: 'plato'},
      ],
    };
    updateTaskStatus(task.id, { status: 'processing' });
    setTimeout(function() {
      socratesSplitSubtasks(task.id, analysis);
    }, CONFIG.timing.beforePickup);
  });
}

// Step: 从信号创建任务(代表黑板上多了一个任务卡片)
function socratesCreateTask(sourceSignal) {
  if (!sourceSignal) {
    setWorkflowStatus('⏳ 无新信号，等待下一轮...');
    setTimeout(function() {
      state.workflowRunning = false;
      startWorkflow();
    }, CONFIG.timing.noSignalWait);
    return;
  }

  var signalContent = sourceSignal.content || '';
  var signalType = sourceSignal.signal_type || '';
  var topic = signalContent.substring(0, 50).replace(/\s+/g, ' ').trim() || '系统任务';
  var taskTitle = signalType.replace(':', '：') + ' ' + topic;

  setWorkflowStatus('📝 创建任务: ' + taskTitle.substring(0, 25));

  // 1. 创建任务(黑板)
  createTask({
    title: taskTitle,
    description: signalContent,
    source_signal_id: sourceSignal.id,
    created_by: 'socrates',
  }).then(function(task) {
    var taskId = task ? task.id : ('wf-' + (++state.workflowTaskId));

    // 2. 标记信号已消费，解除防重入锁
    consumeSignal(sourceSignal.id, taskId);
    state.processingSignalId = null;

    // 3. 重新拉黑板刷新
    fetchBlackboardTasks().then(function(tasks) {
      state.blackboardTasks = tasks;
      renderBlackboard();

      // 4. 调 LLM 分析任务并拆解成子任务
      setWorkflowStatus('\u{1F9E0} 苏格拉底分析任务...');
      var userMsg = buildAnalysisPrompt(taskTitle, signalContent);
      callAgentGateway('socrates', '你是苏格拉底，Nous团队PM。分析任务只返回JSON。', userMsg).then(function(raw) {
        var analysis = parseAnalysisResult(raw);
        if (!analysis || !analysis.subtaskPlan) {
          analysis = {
            domain: 'general', complexity: 'medium',
            summary: taskTitle.substring(0, 40),
            subtaskPlan: [
              {name: '\u9700\u6C42\u5206\u6790: ' + taskTitle.substring(0, 30), assignee: 'plato'},
              {name: '\u4EE3\u7801\u5B9E\u73B0: ' + taskTitle.substring(0, 30), assignee: 'aris'},
              {name: '\u7ED3\u679C\u9A8C\u8BC1: ' + taskTitle.substring(0, 30), assignee: 'plato'},
            ],
          };
        }
        setWorkflowStatus('\u{1F4CA} \u5206\u6790: ' + (analysis.summary || ''));
        setTimeout(function() {
          socratesSplitSubtasks(taskId, analysis);
        }, CONFIG.timing.beforePickup);
      }).catch(function(err) {
        var analysis = {
          domain: 'general', complexity: 'medium',
          summary: taskTitle.substring(0, 40),
          subtaskPlan: [
            {name: '\u9700\u6C42\u5206\u6790: ' + taskTitle.substring(0, 30), assignee: 'plato'},
            {name: '\u4EE3\u7801\u5B9E\u73B0: ' + taskTitle.substring(0, 30), assignee: 'aris'},
            {name: '\u7ED3\u679C\u9A8C\u8BC1: ' + taskTitle.substring(0, 30), assignee: 'plato'},
          ],
        };
        setWorkflowStatus('\u26A0\uFE0F LLM\u5931\u8D25\uFF0C\u964D\u7EA7\u62C6\u89E3');
        setTimeout(function() {
          socratesSplitSubtasks(taskId, analysis);
        }, CONFIG.timing.beforePickup);
      });
    });
  });
}

// Step: 拆解任务为子任务
function socratesSplitSubtasks(taskId, analysis) {
  var subtaskDefs = analysis.subtaskPlan;

  setWorkflowStatus('🔧 拆解 ' + subtaskDefs.length + ' 个子任务...');

  createSubTasks(taskId, subtaskDefs).then(function(result) {
    if (result && result.subtasks) {
      // 重新拉黑板
      fetchBlackboardTasks().then(function(tasks) {
        state.blackboardTasks = tasks;
        renderBlackboard();
        renderAgenda();

        setWorkflowStatus('📌 任务已拆解，等待执行...');
        processNextSubtask(result.subtasks, 0, taskId);
      });
    } else {
      // fallback: 本地子任务
      var localSubs = subtaskDefs.map(function(def, i) {
        return { id: 'st-' + i, task_id: taskId, name: def.name, assignee: def.assignee, status: 'pending' };
      });
      setWorkflowStatus('📌 任务已拆解(本地)，等待执行...');
      processNextSubtask(localSubs, 0, taskId);
    }
  });
}

// Step: 逐个执行子任务（通过 Agent Gateway API）
function processNextSubtask(subtasks, idx, parentTaskId) {
  if (idx >= subtasks.length) {
    // 所有子任务完成 → 归档
    setTimeout(function() {
      setWorkflowStatus('📥 所有子任务完成，苏格拉底归档...');
      socratesArchive(parentTaskId);
    }, CONFIG.timing.beforeArchive);
    return;
  }

  var st = subtasks[idx];
  var agentId = st.assignee || 'aris';
  var cfg = getAgentCfg(agentId);

  setWorkflowStatus('📩 ' + (cfg ? cfg.label : agentId) + ' 领取: ' + st.name.substring(0, 25));

  // 标记子任务为进行中
  updateSubTask(st.id, { status: 'in_progress' });
  st.status = 'in_progress';

  setTimeout(function() {
    walkTo(agentId, CONFIG.tableTarget.x, CONFIG.tableTarget.y, CONFIG.timing.walkNormal, function() {
      state.working[agentId] = { taskId: st.id, status: 'working', name: st.name };
      renderMeetingRoomTasks();
      renderAgenda();
      renderDesks();

      setWorkflowStatus('🏗 ' + (cfg ? cfg.label : agentId) + ' 回到工位调用 LLM 执行...');

      var deskPos = CONFIG.deskAgentPos[agentId];
      walkTo(agentId, deskPos.x, deskPos.y, CONFIG.timing.walkShort, function() {
        setWorkflowStatus('🟡 ' + (cfg ? cfg.label : agentId) + ' LLM 处理: ' + st.name.substring(0, 20));

        // 实际调用 Agent Gateway API 执行子任务
        var execSystem = '你是' + (cfg ? cfg.label : agentId) + '，Nous团队的' + (cfg ? cfg.role : '成员') + '。收到子任务后执行并返回一个JSON结果（只返回JSON）：{"status":"done","result":"执行结果的简短描述"}';
        var execUser = '子任务：' + st.name + '\n请执行并返回结果。';

        callAgentGateway(agentId, execSystem, execUser).then(function(raw) {
          var parsed = null;
          try {
            var m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            var js = m ? m[1] : raw;
            var s = js.indexOf('{'), e = js.lastIndexOf('}');
            if (s >= 0 && e > s) parsed = JSON.parse(js.substring(s, e + 1));
          } catch(ex) {}

          var resultText = (parsed && parsed.result) ? parsed.result : raw.substring(0, 80);
          setWorkflowStatus('✅ ' + (cfg ? cfg.label : agentId) + ' 完成: ' + resultText.substring(0, 30));
          finishSubtask(resultText);
        }).catch(function(err) {
          var errMsg = '执行失败: ' + (err.message || err);
          setWorkflowStatus('⚠️ ' + (cfg ? cfg.label : agentId) + ' LLM失败，标记完成');
          finishSubtask(errMsg);
        });

        function finishSubtask(resultText) {
          walkTo(agentId, CONFIG.tableTarget.x, CONFIG.tableTarget.y, CONFIG.timing.walkNormal, function() {
            // 标记子任务完成，存结果到 DB
            updateSubTask(st.id, { status: 'done', result: resultText });
            st.status = 'done';
            st.result = resultText;
            delete state.working[agentId];

            renderMeetingRoomTasks();
            renderAgenda();
            renderDesks();

            var home = CONFIG.homePositions[agentId];
            walkTo(agentId, home.x, home.y, CONFIG.timing.walkShort, function() {
              renderCharacters();
              processNextSubtask(subtasks, idx + 1, parentTaskId);
            });
          });
        }
      });
    });
  }, CONFIG.timing.beforePickup);
}

// Step: 归档
function socratesArchive(taskId) {
  walkTo('socrates', CONFIG.tableTarget.x, CONFIG.tableTarget.y, CONFIG.timing.walkLong, function() {
    setWorkflowStatus('📦 苏格拉底归档任务...');

    archiveTask(taskId).then(function() {
      // 重新拉数据
      Promise.all([
        fetchBlackboardTasks().then(function(d) { state.blackboardTasks = d; }),
        fetchArchivedTasks().then(function(d) { state.archivedTasks = d; }),
      ]).then(function() {
        setWorkflowStatus('📚 已归档，档案柜 +1');

        walkTo('socrates', CONFIG.archivePos.x, CONFIG.archivePos.y, CONFIG.timing.walkLong, function() {
          renderBlackboard();
          renderArchive();
          renderAgenda();
          renderCharacters();

          var home = CONFIG.homePositions['socrates'];
          walkTo('socrates', home.x, home.y, CONFIG.timing.walkNormal, function() {
            setWorkflowStatus('⏳ 等待下一个任务...');
            state.localTasks = [];
            state.workflowRunning = false;

            setTimeout(function() {
              if (!state.workflowRunning) {
                startWorkflow();
              }
            }, CONFIG.timing.afterArchive);
          });
        });
      });
    });
  });
}
