# 百度语音代理（网页版语音专用）

## 为什么需要它

百度短语音识别 API **不支持浏览器跨域访问**（没有 CORS 头），所以网页版（浏览器打开）不能直接调用。
**APK 安装包（安卓/鸿蒙）不需要这个代理**——安装包里已内置放行，语音直接可用。

只有**网页版**想用语音时，才需要部署这个免费代理（Cloudflare Worker，约 5 分钟，永久免费）。

## 部署步骤

1. 手机/电脑打开：https://dash.cloudflare.com 注册 Cloudflare 账号（免费）
2. 左侧菜单 → **Workers 和 Pages** → **创建应用程序** → **创建 Worker**
3. 删掉默认代码，把 `worker.js` 的内容**全部复制粘贴**进去
4. 点右上角 **部署**（Deploy）
5. 部署成功后点 **处理程序**（Handler）/ 或复制页面显示的 `https://xxx.workers.dev` 地址
6. 把这个地址填进 `app.js` 顶部的 `BAIDU_ASR_PROXY`（例如 `'https://xxx.workers.dev'`），然后重新发布应用

## 完成后的效果

- 网页版按住说话 → 录音 → 发到你的 Worker → Worker 转发百度 → 返回文字 → 自动记账
- 免费额度：Cloudflare Worker 每天 10 万次请求，个人记账随便用

## 安全说明

- Secret Key 在 Worker 里，别人看不到（比放前端更安全）
- 代理只做转发，不存储任何语音和文本
- 介意隐私可在 Worker 里加个访问口令（有需要告诉我，我帮你加）
