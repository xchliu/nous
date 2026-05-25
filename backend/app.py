"""Nous v2 — Flask App 入口"""
import os
import sys
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS

# 将 backend/ 目录加入 path
sys.path.insert(0, os.path.dirname(__file__))

from models import init_db
from routes_agents import agents_bp
from routes_signals import signals_bp
from routes_tasks import tasks_bp

# 前端文件路径
DASHBOARD_DIR = os.path.join(os.path.dirname(__file__), '..', 'dashboard')


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