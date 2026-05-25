"""Nous v2 — Agent Registry API"""
from flask import Blueprint, jsonify, request
from datetime import datetime
from models import db, AgentRegistry, AgentConfig

agents_bp = Blueprint('agents', __name__)


def _naive_now():
    """返回时区无关的 UTC 当前时间（与 SQLite 存储格式一致）"""
    return datetime.utcnow()


@agents_bp.route('/agents', methods=['GET'])
def list_agents():
    agents = AgentRegistry.query.order_by(AgentRegistry.agent_id).all()
    configs = {c.agent_id: c for c in AgentConfig.query.all()}
    now = _naive_now()
    result = []
    for a in agents:
        d = a.to_dict()
        # 注入配置显示信息
        cfg = configs.get(a.agent_id)
        if cfg:
            d['display_name'] = cfg.display_name
            d['color'] = cfg.color
            d['icon'] = cfg.icon
        else:
            d['display_name'] = a.name
            d['color'] = None
            d['icon'] = None

        # 心跳状态指示 (SQLite 存储的是 naive datetime)
        hb = a.last_heartbeat
        if hb:
            if isinstance(hb, str):
                from dateutil import parser as dt_parser
                hb = dt_parser.parse(hb)
                if hb.tzinfo:
                    hb = hb.replace(tzinfo=None)
            elapsed = (now - hb).total_seconds()
            if elapsed < 3600:
                d['heartbeat_status'] = 'green'
            elif elapsed < 7200:
                d['heartbeat_status'] = 'yellow'
            else:
                d['heartbeat_status'] = 'red'
        else:
            d['heartbeat_status'] = 'red' if a.status == 'offline' else 'gray'

        result.append(d)

    return jsonify({'agents': result})


@agents_bp.route('/agents/<agent_id>', methods=['GET'])
def get_agent(agent_id):
    a = AgentRegistry.query.get(agent_id)
    if not a:
        return jsonify({'error': 'Agent not found'}), 404
    d = a.to_dict()
    cfg = AgentConfig.query.get(agent_id)
    if cfg:
        d['display_name'] = cfg.display_name
        d['color'] = cfg.color
        d['icon'] = cfg.icon
    return jsonify({'agent': d})


@agents_bp.route('/agents/<agent_id>/heartbeat', methods=['POST'])
def agent_heartbeat(agent_id):
    a = AgentRegistry.query.get(agent_id)
    if not a:
        return jsonify({'error': 'Agent not found'}), 404
    a.last_heartbeat = _naive_now()
    a.status = 'online'
    data = request.get_json(silent=True) or {}
    if 'current_task_id' in data:
        a.current_task_id = data['current_task_id']
    db.session.commit()
    return jsonify({'status': 'ok', 'agent_id': agent_id, 'heartbeat_at': a.last_heartbeat.isoformat()})