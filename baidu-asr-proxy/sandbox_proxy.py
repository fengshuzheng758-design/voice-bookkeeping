"""语音记账 - 百度语音代理（沙箱临时版）
转发 /token 和 /recognize 到百度，附带 CORS 头。
"""
import json
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

BAIDU_API_KEY = '7NF8FbrX8zgF6DPFmsgzhADW'
BAIDU_SECRET_KEY = 'dsmIsUrq43GHKgxjkaxtJzH1tqIhHUvq'


def json_resp(handler, data, status=200):
    body = json.dumps(data).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_OPTIONS(self):
        handler = self
        handler.send_response(204)
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        handler.send_header('Access-Control-Allow-Headers', 'Content-Type')
        handler.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length).decode('utf-8')) if length else {}

            if self.path == '/token':
                api_key = body.get('apiKey') or BAIDU_API_KEY
                secret_key = body.get('secretKey') or BAIDU_SECRET_KEY
                url = ('https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials'
                       '&client_id={}&client_secret={}').format(
                    urllib.parse.quote(api_key), urllib.parse.quote(secret_key))
                with urllib.request.urlopen(url, timeout=15) as r:
                    data = json.loads(r.read().decode('utf-8'))
                json_resp(self, data)

            elif self.path == '/recognize':
                payload = json.dumps(body).encode('utf-8')
                req = urllib.request.Request(
                    'https://vop.baidu.com/server_api', data=payload,
                    headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.loads(r.read().decode('utf-8'))
                json_resp(self, data)

            else:
                json_resp(self, {'err_no': -1, 'err_msg': 'not found'}, 404)
        except Exception as e:
            json_resp(self, {'err_no': -1, 'err_msg': 'proxy error: ' + str(e)})


if __name__ == '__main__':
    HTTPServer(('0.0.0.0', 8899), ProxyHandler).serve_forever()
