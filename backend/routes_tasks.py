"""Nous v2 — Task Entity API (黑板=任务表, 子任务=执行计划, 归档=status变更)"""
from flask import Blueprint, jsonify, request
from models import db, Task, SubTask

tasks_bp = Blueprint('tasks', __name__)


# ══════════════════════════════════════════
#  Task (黑板)
# ══════════════════════════════════════════

@tasks_bp.route('/tasks', methods=['GET'])
def list_tasks():
    """黑板列表 — 默认返回 pending+processing 状态的任务(即黑板上未完成的)"""
    status_filter = request.args.get('status')

    q = Task.query
    if status_filter:
        # 支持逗号分隔多状态
        statuses = [s.strip() for s in status_filter.split(',')]
        q = q.filter(Task.status.in_(statuses))
    else:
        q = q.filter(Task.status.in_(['pending', 'processing']))

    q = q.order_by(Task.created_at.desc())
    tasks = [t.to_dict() for t in q.all()]
    return jsonify({'tasks': tasks})


@tasks_bp.route('/tasks', methods=['POST'])
def create_task():
    """从黑板取信号 → 创建任务。任务创建时即占位黑板(status=pending)。"""
    data = request.get_json()
    if not data or not data.get('title'):
        return jsonify({'error': 'title is required'}), 400

    import uuid
    task_id = data.get('id') or f"T-{uuid.uuid4().hex[:8]}"

    task = Task(
        id=task_id,
        title=data['title'],
        description=data.get('description', ''),
        status='pending',
        source_signal_id=data.get('source_signal_id'),
        created_by=data.get('created_by', 'socrates'),
    )
    db.session.add(task)
    db.session.commit()

    return jsonify({'task': task.to_dict()}), 201


@tasks_bp.route('/tasks/<task_id>', methods=['GET'])
def get_task(task_id):
    """单个任务详情(含子任务列表)"""
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify({'task': task.to_dict()})


@tasks_bp.route('/tasks/<task_id>', methods=['PATCH'])
def update_task(task_id):
    """更新任务状态"""
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    new_status = data.get('status')
    valid_statuses = ['pending', 'processing', 'done', 'archived']
    if new_status and new_status not in valid_statuses:
        return jsonify({'error': f'Invalid status. Must be one of: {valid_statuses}'}), 400

    if new_status:
        task.status = new_status
    if 'title' in data:
        task.title = data['title']
    if 'description' in data:
        task.description = data['description']

    db.session.commit()
    return jsonify({'task': task.to_dict()})


# ══════════════════════════════════════════
#  SubTask (执行计划)
# ══════════════════════════════════════════

@tasks_bp.route('/tasks/<task_id>/subtasks', methods=['GET'])
def list_subtasks(task_id):
    """获取某任务的所有子任务"""
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    subtasks = SubTask.query.filter_by(task_id=task_id).order_by(SubTask.created_at).all()
    return jsonify({'subtasks': [s.to_dict() for s in subtasks]})


@tasks_bp.route('/tasks/<task_id>/subtasks', methods=['POST'])
def create_subtasks(task_id):
    """批量创建子任务(执行计划) — 把父任务状态改为 processing"""
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    data = request.get_json()
    items = data.get('subtasks', []) if data else []
    if not items:
        return jsonify({'error': 'subtasks array is required'}), 400

    import uuid
    created = []
    for item in items:
        st = SubTask(
            id=f"ST-{uuid.uuid4().hex[:8]}",
            task_id=task_id,
            name=item.get('name', item.get('title', '')),
            assignee=item.get('assignee'),
            status='pending',
        )
        db.session.add(st)
        created.append(st)

    # 父任务进入 processing
    task.status = 'processing'
    db.session.commit()

    return jsonify({
        'task_id': task_id,
        'task_status': task.status,
        'subtasks': [s.to_dict() for s in created],
    }), 201


@tasks_bp.route('/subtasks/<subtask_id>', methods=['PATCH'])
def update_subtask(subtask_id):
    """更新子任务状态/负责人"""
    st = SubTask.query.get(subtask_id)
    if not st:
        return jsonify({'error': 'SubTask not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    if 'status' in data:
        st.status = data['status']
    if 'assignee' in data:
        st.assignee = data['assignee']
    if 'result' in data:
        st.result = data['result']

    db.session.commit()

    # 检查是否所有子任务都完成 → 父任务自动 done
    if st.status == 'done':
        task = Task.query.get(st.task_id)
        if task:
            all_done = all(s.status == 'done' for s in task.subtasks)
            if all_done:
                task.status = 'done'
                db.session.commit()

    return jsonify({'subtask': st.to_dict()})


# ══════════════════════════════════════════
#  Archive (归档)
# ══════════════════════════════════════════

@tasks_bp.route('/tasks/<task_id>/archive', methods=['POST'])
def archive_task(task_id):
    """归档任务 — status → archived"""
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    if task.status != 'done':
        return jsonify({'error': 'Only done tasks can be archived', 'current_status': task.status}), 400

    task.status = 'archived'
    db.session.commit()
    return jsonify({'task': task.to_dict(), 'message': 'Task archived'})


@tasks_bp.route('/archived-tasks', methods=['GET'])
def list_archived():
    """档案柜 — 所有已归档任务"""
    tasks = Task.query.filter_by(status='archived').order_by(Task.updated_at.desc()).all()
    return jsonify({'archived_tasks': [t.to_dict() for t in tasks]})
