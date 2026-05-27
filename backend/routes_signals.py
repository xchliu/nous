"""Nous v2 — Signal Log API"""
from flask import Blueprint, jsonify, request
from datetime import datetime
from models import db, SignalLog

signals_bp = Blueprint('signals', __name__)


@signals_bp.route('/signals', methods=['GET'])
def list_signals():
    q = SignalLog.query

    # 过滤参数
    from_agent = request.args.get('from_agent')
    to_agent = request.args.get('to_agent')
    signal_type = request.args.get('type')
    task_id = request.args.get('task_id')
    since = request.args.get('since')

    if from_agent:
        q = q.filter(SignalLog.from_agent == from_agent)
    if to_agent:
        q = q.filter(SignalLog.to_agent == to_agent)
    if signal_type:
        q = q.filter(SignalLog.signal_type == signal_type)
    if task_id:
        q = q.filter(SignalLog.task_id == task_id)
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            q = q.filter(SignalLog.created_at >= since_dt)
        except ValueError:
            pass

    limit = request.args.get('limit', 100, type=int)
    q = q.order_by(SignalLog.created_at.desc()).limit(limit)

    signals = [s.to_dict() for s in q.all()]
    return jsonify({'signals': signals})


@signals_bp.route('/signals', methods=['POST'])
def create_signal():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    signal_type = data.get('signal_type')
    from_agent = data.get('from_agent')
    if not signal_type or not from_agent:
        return jsonify({'error': 'signal_type and from_agent are required'}), 400

    s = SignalLog(
        signal_type=signal_type,
        from_agent=from_agent,
        to_agent=data.get('to_agent'),
        task_id=data.get('task_id'),
        content=data.get('content', ''),
        metadata_json=data.get('metadata_json'),
        created_at=datetime.utcnow(),
    )
    db.session.add(s)
    db.session.commit()

    return jsonify({'signal': s.to_dict()}), 201


@signals_bp.route('/signals/stats', methods=['GET'])
def signal_stats():
    """信号统计：各类型数量和各agent活跃度"""
    from sqlalchemy import func

    # 各类型数量
    type_counts = db.session.query(
        SignalLog.signal_type, func.count(SignalLog.id)
    ).group_by(SignalLog.signal_type).all()

    # 各agent活跃度（作为发送方）
    agent_counts = db.session.query(
        SignalLog.from_agent, func.count(SignalLog.id)
    ).group_by(SignalLog.from_agent).all()

    return jsonify({
        'type_counts': {t: c for t, c in type_counts},
        'agent_activity': {a: c for a, c in agent_counts},
    })


@signals_bp.route('/signals/<int:signal_id>/consume', methods=['POST'])
def consume_signal(signal_id):
    """标记信号已被消费(Socrates取走后标记)"""
    signal = SignalLog.query.get(signal_id)
    if not signal:
        return jsonify({'error': 'Signal not found'}), 404

    data = request.get_json(silent=True) or {}
    signal.consumed = True
    if data.get('task_id'):
        signal.task_id = data['task_id']
    db.session.commit()
    return jsonify({'signal': signal.to_dict(), 'message': 'Signal consumed'})