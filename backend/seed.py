"""Nous v2 — Mock 数据种子"""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from models import db, AgentRegistry, AgentConfig, SignalLog, TaskEvent


def seed():
    app = create_app()
    with app.app_context():
        db.drop_all()
        db.create_all()

        now = datetime.utcnow()

        # ── 4 个 Agent ─────────────────────────────────────
        agents = [
            AgentRegistry(
                agent_id='socrates', name='苏格拉底', role='PM',
                gateway_port=8642, status='online',
                last_heartbeat=now - timedelta(minutes=2),
                current_task_id='TD-003',
            ),
            AgentRegistry(
                agent_id='aris', name='小亚', role='Dev',
                gateway_port=8643, status='online',
                last_heartbeat=now - timedelta(minutes=5),
                current_task_id='TD-004',
            ),
            AgentRegistry(
                agent_id='plato', name='柏拉图', role='Arch',
                gateway_port=8645, status='online',
                last_heartbeat=now - timedelta(minutes=8),
                current_task_id='TD-002',
            ),
            AgentRegistry(
                agent_id='grace', name='Grace', role='Aux',
                gateway_port=8644, status='offline',
                last_heartbeat=now - timedelta(hours=3),
                current_task_id=None,
            ),
        ]
        db.session.add_all(agents)

        # Agent 配置（颜色、显示名、token）
        configs = [
            AgentConfig(agent_id='socrates', display_name='苏格拉底', color='#2563eb',
                        icon='socrates', nous_api_token='nous-token-socrates'),
            AgentConfig(agent_id='aris', display_name='小亚', color='#10b981',
                        icon='aris', nous_api_token='nous-token-aris'),
            AgentConfig(agent_id='plato', display_name='柏拉图', color='#f97316',
                        icon='plato', nous_api_token='nous-token-plato'),
            AgentConfig(agent_id='grace', display_name='Grace', color='#f59e0b',
                        icon='grace', nous_api_token='nous-token-grace'),
        ]
        db.session.add_all(configs)
        db.session.commit()

        # ── 信号时间线（最近24小时） ────────────────────────
        def signal(st, frm, to, task, content, ago_hours):
            return SignalLog(
                signal_type=st, from_agent=frm, to_agent=to,
                task_id=task, content=content,
                created_at=now - timedelta(hours=ago_hours),
            )

        signals = [
            # HEARTBEAT — 每个agent 3-4条
            signal('HEARTBEAT', 'socrates', None, None, 'Heartbeat OK', 0.5),
            signal('HEARTBEAT', 'socrates', None, None, 'Heartbeat OK', 6),
            signal('HEARTBEAT', 'socrates', None, None, 'Heartbeat OK', 12),
            signal('HEARTBEAT', 'socrates', None, None, 'Heartbeat OK', 20),
            signal('HEARTBEAT', 'aris', None, None, 'Heartbeat OK', 1),
            signal('HEARTBEAT', 'aris', None, None, 'Heartbeat OK', 7),
            signal('HEARTBEAT', 'aris', None, None, 'Heartbeat OK', 14),
            signal('HEARTBEAT', 'plato', None, None, 'Heartbeat OK', 1.5),
            signal('HEARTBEAT', 'plato', None, None, 'Heartbeat OK', 8),
            signal('HEARTBEAT', 'plato', None, None, 'Heartbeat OK', 16),
            signal('HEARTBEAT', 'grace', None, None, 'Heartbeat OK', 2),
            signal('HEARTBEAT', 'grace', None, None, 'Heartbeat OK', 10),
            # grace 最后一条在3小时前
            signal('HEARTBEAT', 'grace', None, None, 'Heartbeat OK', 3),

            # DONE — 苏哥验收完成
            signal('DONE', 'socrates', 'plato', 'TD-002',
                   '验收完成: Nous架构文档v2', 3),
            signal('DONE', 'socrates', 'aris', 'TD-003',
                   '验收完成: Agent Registry API', 1),

            # BLOCKED — 小亚被阻塞
            signal('BLOCKED', 'aris', 'socrates', 'TD-004',
                   'Gateway TTFB耗时>30s，需要排查gateway性能问题', 2),

            # ASK — 柏拉图架构评审反馈
            signal('ASK:arch', 'plato', 'aris', 'TD-004',
                   '建议使用SQLAlchemy批量插入替代逐条INSERT，提升性能', 4),

            # SYNC — 同步通知
            signal('SYNC', 'plato', None, 'TD-002',
                   '架构文档v2已完成，路径: docs/ARCHITECTURE-v2.md', 5),

            # REPAIR — 苏哥修复配置
            signal('REPAIR', 'socrates', 'plato', None,
                   '修复柏拉图provider配置: 将openai改为custom provider finna', 6),
        ]
        db.session.add_all(signals)
        db.session.commit()

        # ── 任务生命周期事件 ────────────────────────────────
        def event(tid, evt, agent, detail, ago_hours):
            return TaskEvent(
                task_id=tid, event_type=evt, agent_id=agent,
                detail=detail,
                created_at=now - timedelta(hours=ago_hours),
            )

        events = [
            # TD-003: 完整生命周期
            event('TD-003', 'created', 'socrates', '创建任务: Agent Registry API', 12),
            event('TD-003', 'assigned', 'socrates', '分配给 aris', 11.8),
            event('TD-003', 'claimed', 'aris', '认领开发', 11.5),
            event('TD-003', 'started', 'aris', '开始开发', 10),
            event('TD-003', 'completed', 'aris', 'API开发完成，提交PR', 2),
            event('TD-003', 'reviewed', 'plato', '代码评审通过', 1.5),
            event('TD-003', 'accepted', 'socrates', '验收通过，合并到main', 1),

            # TD-004: 有阻塞-重分配的生命周期
            event('TD-004', 'created', 'socrates', '创建任务: Gateway性能优化', 10),
            event('TD-004', 'assigned', 'socrates', '分配给 aris', 9.8),
            event('TD-004', 'claimed', 'aris', '认领开发', 9.5),
            event('TD-004', 'started', 'aris', '开始诊断gateway性能', 8),
            event('TD-004', 'blocked', 'aris', 'Gateway TTFB>30s，等待plato支持', 6),
            event('TD-004', 'reassigned', 'socrates', '重新分配给 plato', 4),
            event('TD-004', 'started', 'plato', '开始排查gateway性能', 3.5),
            event('TD-004', 'completed', 'plato', '修复完成，TTFB降至200ms', 0.5),
        ]
        db.session.add_all(events)
        db.session.commit()

        print('Seed completed!')
        print(f'  Agents:      {AgentRegistry.query.count()}')
        print(f'  Configs:     {AgentConfig.query.count()}')
        print(f'  Signals:     {SignalLog.query.count()}')
        print(f'  TaskEvents:  {TaskEvent.query.count()}')


if __name__ == '__main__':
    seed()