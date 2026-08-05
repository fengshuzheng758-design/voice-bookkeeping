/**
 * 极简语音记账 - Service Worker
 * 功能：
 * 1. 安装时预缓存所有静态资源
 * 2. 运行时缓存 Chart.js CDN 和其他网络请求
 * 3. 离线时提供缓存的页面和资源
 * 注意：语音识别（Web Speech API）本身需要网络，离线时前端会隐藏语音按钮
 */

// 缓存名称（版本号便于更新，功能升级时递增以刷新缓存）
const CACHE_NAME = 'voice-bookkeeping-v9';

// 需要预缓存的静态资源列表
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  // Chart.js CDN 也加入预缓存，确保统计图表离线可用
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

/**
 * Service Worker 安装事件
 * 预缓存所有关键静态资源
 */
self.addEventListener('install', (event) => {
  console.log('[SW] 正在安装 Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 正在预缓存资源...');
        // 逐一缓存，单个失败不影响整体
        return Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] 缓存失败: ${url}`, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] 预缓存完成，立即激活');
        return self.skipWaiting();
      })
  );
});

/**
 * Service Worker 激活事件
 * 清理旧版本缓存
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker 已激活');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`[SW] 清理旧缓存: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Service Worker 请求拦截
 * 策略：
 *  - 代码类文件（html/js/css/manifest）：Network First（保证修复即时生效，离线回退缓存）
 *  - Chart.js CDN：Stale-While-Revalidate
 *  - 图标等静态资源：Cache First
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 跳过非 GET 请求（如 IndexedDB 操作等）
  if (request.method !== 'GET') return;

  // 跳过 chrome-extension 等特殊协议
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // Chart.js CDN 使用 Stale-While-Revalidate 策略
  if (request.url.includes('chart.js')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 代码类文件：网络优先（开发/修复阶段保证最新，离线回退缓存）
  if (/\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 图标等静态资源使用 Cache First 策略
  event.respondWith(cacheFirst(request));
});

/**
 * 网络优先策略
 * 优先请求网络获取最新版本，成功则更新缓存；网络失败时回退缓存（离线可用）
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // 网络失败，回退缓存
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    if (request.mode === 'navigate') {
      const cachedHome = await cache.match('./index.html');
      if (cachedHome) return cachedHome;
    }
    return new Response('离线状态，该资源不可用', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * 缓存优先策略
 * 先从缓存读取，缓存未命中时请求网络并缓存
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    // 仅缓存成功的响应
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn(`[SW] 网络请求失败: ${request.url}`, error);
    // 对于导航请求（HTML页面），返回缓存的首页
    if (request.mode === 'navigate') {
      const cachedHome = await caches.match('./index.html');
      if (cachedHome) return cachedHome;
    }
    // 返回离线提示响应
    return new Response('离线状态，该资源不可用', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Stale-While-Revalidate 策略
 * 立即返回缓存内容（如有），同时后台更新缓存
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // 后台发起网络请求更新缓存（不阻塞响应）
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((err) => {
      console.warn(`[SW] 后台更新失败: ${request.url}`, err);
    });

  // 有缓存则立即返回，否则等待网络
  return cachedResponse || fetchPromise;
}
