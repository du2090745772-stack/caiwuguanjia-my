# 本地开发预览：python3 serve.py [端口]，默认 8765。禁用缓存，改完刷新即生效。
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
