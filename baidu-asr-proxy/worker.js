/**
 * 语音记账 - 百度语音代理 (Cloudflare Worker)
 * 
 * 用途：百度短语音识别 API 不支持浏览器跨域（CORS），网页版需要此代理中转。
 * 部署：注册 Cloudflare 账号（免费）→ Workers → 创建 Worker → 粘贴本文件 → 部署
 * 部署后把生成的 https://xxxx.workers.dev 地址填入 app.js 的 BAIDU_ASR_PROXY。
 * 
 * 注意：Secret Key 会暴露在代理中，仅个人使用可接受；介意可自行加鉴权。
 */

// 百度语音识别的 API Key 和 Secret Key（与 app.js 中一致，代理需要它来换取 token）
const BAIDU_API_KEY = '7NF8FbrX8zgF6DPFmsgzhADW';
const BAIDU_SECRET_KEY = 'dsmIsUrq43GHKgxjkaxtJzH1tqIhHUvq';

export default {
  async fetch(request, env, ctx) {
    // 只接受 POST
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/token') {
        // 换取 access_token
        const body = await request.json();
        const apiKey = body.apiKey || BAIDU_API_KEY;
        const secretKey = body.secretKey || BAIDU_SECRET_KEY;
        const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
        const resp = await fetch(tokenUrl);
        const data = await resp.json();
        return json(data);
      }

      if (path === '/recognize') {
        // 转发语音识别
        const body = await request.json();
        const resp = await fetch('https://vop.baidu.com/server_api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await resp.json();
        return json(data);
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      return json({ err_no: -1, err_msg: 'proxy error: ' + e.message });
    }
  }
};

/** 统一 JSON 响应（带 CORS 头） */
function json(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
