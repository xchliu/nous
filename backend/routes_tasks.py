"""Nous v2 — Task Lifecycle API"""
from flask import Blueprint, jsonify, request
from models import db, TaskEvent

tasks_bp = Blueprint('tasks', __name__)


@tasks_bp.route('/tasks', methods=['GET'])
def list_tasks():
    """返回任务列表（含生命周期事件），支持按 status/agent 过滤"""
    status_filter = request.args.get('status')
    agent_filter = request.args.get('agent')

    q = TaskEvent.query

    if status_filter:
        q = q.filter(TaskEvent.event_type == status_filter)
    if agent_filter:
        q = q.filter(TaskEvent.agent_id == agent_filter)

    # 获取所有唯一 task_id
    task_ids_q = db.session.query(TaskEvent.task_id).distinct()
    if status_filter:
        task_ids_q = task_ids_q.filter(TaskEvent.event_type == status_filter)
    if agent_filter:
        task_ids_q = task_ids_q.filter(TaskEvent.agent_id == agent_filter)

    task_ids = [row[0] for row in task_ids_q.all()]

    tasks = []
    for tid in task_ids:
        events = TaskEvent.query.filter_by(task_id=tid).order_by(TaskEvent.created_at).all()
        events_data = [e.to_dict() for e in events]

        # 从事件流推断任务状态
        last_event = events[-1] if events else None
        status_map = {
            'created': 'backlog',
            'assigned': 'backlog',
            'claimed': 'running',
            'started': 'running',
            'blocked': 'blocked',
            'completed': 'done',
            'reviewed': 'done',
            'accepted': 'done',
            'reassigned': 'running',
        }
        current_status = status_map.get(last_event.event_type, 'unknown') if last_event else 'unknown'
        # started after blocked → still running
        if last_event and last_event.event_type == 'started':
            # check if any blocked event before this started
            has_blocked = any(e.event_type == 'blocked' for e in events[:-1])
            current_status = 'running'

        # 处理 blocked → reassigned → started → completed 链
        # 只需看最后一个事件
        if last_event:
            if last_event.event_type == 'blocked':
                current_status = 'blocked'
            elif last_event.event_type == 'completed':
                current_status = 'done'
            elif last_event.event_type == 'accepted':
                current_status = 'done'
            elif last_event.event_type == 'reassigned':
                current_status = 'running'

        # assignee = 最后一个 claimed/started 事件的 agent
        assignee = None
        for e in reversed(events):
            if e.event_type in ('claimed', 'started', 'reassigned', 'assigned'):
                assignee = e.agent_id
                break

        # title 从首个事件 detail 取
        first_event = events[0] if events else None
        title = first_event.detail if first_event else tid

        tasks.append({
            'id': tid,
            'title': title,
            'status': current_status,
            'assignee': assignee,
            'events': events_data,
        })

    return jsonify({'tasks': tasks})


@tasks_bp.route('/tasks/<task_id>/events', methods=['GET'])
def get_task_events(task_id):
    """单个任务的生命周期事件流"""
    events = TaskEvent.query.filter_by(task_id=task_id).order_by(TaskEvent.created_at).all()
    if not events:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify({
        'task_id': task_id,
        'events': [e.to_dict() for e in events],
    })


@tasks_bp.route('/tasks/events', methods=['GET'])
def all_task_events():
    """全部任务事件时间线"""
    limit = request.args.get('limit', 100, type=int)
    events = TaskEvent.query.order_by(TaskEvent.created_at.desc()).limit(limit).all()
    return jsonify({
        'events': [e.to_dict() for e in events],
    })