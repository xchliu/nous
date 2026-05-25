"""Nous v2 — 数据模型"""
import os
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

db = SQLAlchemy()

DB_PATH = os.path.join(os.path.dirname(__file__), 'nous.db')


def init_db(app):
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    with app.app_context():
        db.create_all()


# ── Agent Registry ──────────────────────────────────────────────
class AgentRegistry(db.Model):
    __tablename__ = 'agent_registry'

    agent_id       = db.Column(db.Text, primary_key=True)
    name           = db.Column(db.Text, nullable=False)
    role           = db.Column(db.Text)
    gateway_port   = db.Column(db.Integer)
    status         = db.Column(db.Text, default='offline')
    last_heartbeat = db.Column(db.DateTime)
    current_task_id = db.Column(db.Text)
    last_signal_at = db.Column(db.DateTime)
    api_key        = db.Column(db.Text)
    config_json    = db.Column(db.Text)

    def to_dict(self):
        return {
            'agent_id':       self.agent_id,
            'name':           self.name,
            'role':           self.role,
            'gateway_port':   self.gateway_port,
            'status':         self.status or 'offline',
            'last_heartbeat': self.last_heartbeat.isoformat() if self.last_heartbeat else None,
            'current_task_id': self.current_task_id,
            'last_signal_at': self.last_signal_at.isoformat() if self.last_signal_at else None,
        }


# ── Signal Log ──────────────────────────────────────────────────
class SignalLog(db.Model):
    __tablename__ = 'signal_log'

    id            = db.Column(db.Integer, primary_key=True, autoincrement=True)
    signal_type   = db.Column(db.Text, nullable=False)
    from_agent    = db.Column(db.Text, nullable=False)
    to_agent      = db.Column(db.Text)
    task_id       = db.Column(db.Text)
    content       = db.Column(db.Text)
    metadata_json = db.Column(db.Text)
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id':            self.id,
            'signal_type':   self.signal_type,
            'from_agent':    self.from_agent,
            'to_agent':      self.to_agent,
            'task_id':       self.task_id,
            'content':       self.content,
            'metadata_json': self.metadata_json,
            'created_at':    self.created_at.isoformat() if self.created_at else None,
        }


# ── Task Events ─────────────────────────────────────────────────
class TaskEvent(db.Model):
    __tablename__ = 'task_events'

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    task_id    = db.Column(db.Text, nullable=False)
    event_type = db.Column(db.Text, nullable=False)
    agent_id   = db.Column(db.Text)
    detail     = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id':         self.id,
            'task_id':    self.task_id,
            'event_type': self.event_type,
            'agent_id':   self.agent_id,
            'detail':     self.detail,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── Agent Config ────────────────────────────────────────────────
class AgentConfig(db.Model):
    __tablename__ = 'agent_config'

    agent_id      = db.Column(db.Text, primary_key=True)
    display_name  = db.Column(db.Text)
    color         = db.Column(db.Text)
    icon          = db.Column(db.Text)
    skills        = db.Column(db.Text)
    nous_api_token = db.Column(db.Text, nullable=False)

    def to_dict(self):
        return {
            'agent_id':      self.agent_id,
            'display_name':  self.display_name,
            'color':         self.color,
            'icon':          self.icon,
            'skills':        self.skills,
        }