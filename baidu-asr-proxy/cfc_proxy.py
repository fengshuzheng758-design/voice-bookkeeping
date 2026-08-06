# -*- coding: utf-8 -*-
# 语音记账 - 百度智能云 CFC 语音代理（适配 /proxy 单一路由）
# 所有请求都发到 https://xxx.cfc-execute.bj.baidubce.com/proxy
# 请求体带 action 字段区分：{"action":"token"} 或 {"action":"recognize", ...}

import json
import urllib.request
import urllib.parse

BAIDU_API_KEY = '7NF8FbrX8zgF6DPFmsgzhADW'
BAIDU_SECRET_KEY = 'dsmIsUrq43GHKgxjkaxtJzH1tqIhHUvq'

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
}


def handler(event, context):
    try:
        # 处理 OPTIONS 预检请求（浏览器跨域安全机制必需）
        http_method = event.get('httpMethod', '') or event.get('method', '')
        if http_method.upper() == 'OPTIONS':
            return resp({}, 200, is_options=True)

        # 解析请求体
        body = event.get('body') or '{}'
        if isinstance(body, str):
            data = json.loads(body)
        else:
            data = body

        action = data.get('action', '')

        if action == 'token':
            api_key = data.get('apiKey') or BAIDU_API_KEY
            secret_key = data.get('secretKey') or BAIDU_SECRET_KEY
            url = ('https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials'
                   '&client_id={}&client_secret={}').format(
                urllib.parse.quote(api_key), urllib.parse.quote(secret_key))
            with urllib.request.urlopen(url, timeout=15) as r:
                result = json.loads(r.read().decode('utf-8'))
            return resp(result)

        if action == 'recognize':
            payload = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(
                'https://vop.baidu.com/server_api', data=payload,
                headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=30) as r:
                result = json.loads(r.read().decode('utf-8'))
            return resp(result)

        return resp({'err_no': -1, 'err_msg': 'unknown action: ' + action}, 404)
    except Exception as e:
        return resp({'err_no': -1, 'err_msg': 'proxy error: ' + str(e)})


def resp(data, status=200, is_options=False):
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
    }
    headers.update(CORS_HEADERS)
    if is_options:
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}
    return {
        'statusCode': status,
        'headers': headers,
        'body': json.dumps(data, ensure_ascii=False)
    }
