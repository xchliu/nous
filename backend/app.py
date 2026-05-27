"""Nous v2 — Flask App 入口"""
import os
import sys
import requests
from flask import Flask, jsonify, request, send_from_directory, send_file, Response
from flask_cors import CORS

# Agent gateway mapping — backend proxies to avoid CORS
AGENT_GATEWAYS = {
    'socrates': {'url': 'http://localhost:8642/v1/chat/completions', 'key': 'your-secret-key'},
    'aris':     {'url': 'http://localhost:8643/v1/chat/completions', 'key': 'aris-secret'},
    'plato':    {'url': 'http://localhost:8645/v1/chat/completions', 'key': 'plato-secret'},
}

# 将 backend/ 目录加入 path
sys.path.insert(0, os.path.dirname(__file__))

from models import init_db
from routes_agents import agents_bp
from routes_signals import signals_bp
from routes_tasks import tasks_bp

# 前端文件路径
DASHBOARD_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'static')


def create_app():
    app = Flask(__name__, static_folder=None)
    CORS(app)

    # 初始化数据库
    init_db(app)

    # 注册蓝图
    app.register_blueprint(agents_bp, url_prefix='/api')
    app.register_blueprint(signals_bp, url_prefix='/api')
    app.register_blueprint(tasks_bp, url_prefix='/api')

    # 认证中间件 (Phase1 就启用 Bearer token)
    # Read token from file first (for dev), fallback to env var
    TOKEN_FILE = '/tmp/.nous_token'
    NOUS_TOKEN = None
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            NOUS_TOKEN = f.read().strip()
    if not NOUS_TOKEN:
        NOUS_TOKEN = os.environ.get('NOUS_API_TOKEN', 'nous-admin-token-v2')

    @app.before_request
    def check_auth():
        # 跳过 OPTIONS 预检请求
        if request.method == 'OPTIONS':
            return
        # 只对 /api/* 路径做认证
        if not request.path.startswith('/api/'):
            return
        # 跳过健康检查
        if request.path == '/api/health':
            return
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized: missing Bearer token'}), 401
        token = auth.replace('Bearer ', '')
        if token != NOUS_TOKEN:
            return jsonify({'error': 'Unauthorized: invalid token'}), 401

    # 健康检查
    @app.route('/api/health')
    def health():
        return jsonify({'status': 'ok', 'service': 'nous-v2', 'version': '2.0.0'})

    # Agent Gateway proxy — frontend calls this to avoid CORS
    @app.route('/api/agent-gateway', methods=['POST', 'OPTIONS'])
    def agent_gateway_proxy():
        if request.method == 'OPTIONS':
            return '', 204
        data = request.get_json(silent=True) or {}
        agent_id = data.get('agent_id', '')
        gateway = AGENT_GATEWAYS.get(agent_id)
        if not gateway:
            return jsonify({'error': 'Unknown agent: ' + agent_id}), 400

        payload = {
            'model': data.get('model', ''),
            'messages': [
                {'role': 'system', 'content': data.get('system_prompt', '')},
                {'role': 'user', 'content': data.get('user_message', '')},
            ],
            'max_tokens': data.get('max_tokens', 400),
            'temperature': data.get('temperature', 0.3),
        }
        try:
            r = requests.post(
                gateway['url'],
                json=payload,
                headers={
                    'Authorization': 'Bearer ' + gateway['key'],
                    'Content-Type': 'application/json',
                },
                timeout=30,
                proxies={'http': None, 'https': None},  # bypass Surge proxy for localhost
            )
            return Response(r.content, status=r.status_code, content_type='application/json')
        except requests.RequestException as e:
            return jsonify({'error': 'Gateway unreachable: ' + str(e)}), 502

    # 前端静态文件
    @app.route('/')
    def index():
        return send_file(os.path.join(DASHBOARD_DIR, 'index.html'))

    @app.route('/<path:filename>')
    def static_files(filename):
        return send_from_directory(DASHBOARD_DIR, filename)

    return app


if __name__ == '__main__':
    app = create_app()
    print('Nous v2 backend starting on http://localhost:8600')
    app.run(host='0.0.0.0', port=8600, debug=True)