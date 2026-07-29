/**
 * 极简语音记账 - 核心逻辑 v1.1
 * 功能模块：
 * 1. IndexedDB 本地数据库（账单/设置/回收站/分类记忆）
 * 2. 中文数字解析器 (parseChineseNumber)
 * 3. 智能语义解析器 (parseBillText)
 * 4. 语音识别（按住说话 / 松开发送 / 滑出取消 / 超时处理 / 实时预览）
 * 5. 语音胶囊（识别成功的轻量确认卡片，字段就地编辑）
 * 6. 智能分类记忆（用户修改分类后记住关键词→分类映射）
 * 7. 快速撤销（记账后 3 秒内可撤销）
 * 8. 账单列表（点击编辑 / 左滑删除 / 长按多选批量删除）
 * 9. 回收站（删除保留 7 天，可恢复/永久删除）
 * 10. 数据统计（Chart.js 图表）
 * 11. 设置模块（自定义分类 / 数据导入导出）
 */

// ============================================================
// 一、全局常量与配置
// ============================================================

/** IndexedDB 配置 */
const DB_NAME = 'VoiceBookkeepingDB';
const DB_VERSION = 2;              // v2：新增 trash（回收站）与 keywordCategoryMap（分类记忆）
const STORE_NAME = 'bills';        // 账单表
const TRASH_STORE = 'trash';       // 回收站表
const KEYWORD_STORE = 'keywordCategoryMap'; // 关键词→分类记忆表

/** 默认支出分类（两级结构：大类 → 小类，小类含识别关键词） */
const DEFAULT_EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍜', subs: [
    // 注：移除"买"/"吃饭"等通用词，避免"买儿童玩具"被误判为"买菜/聚餐"
    { name: '早饭', keywords: ['早饭', '早餐', '早点', '包子', '油条', '豆浆', '稀饭', '粥', '上午饭'] },
    { name: '午饭', keywords: ['午饭', '午餐', '中饭', '中餐', '工作餐', '中午', '中午饭'] },
    { name: '晚饭', keywords: ['晚饭', '晚餐'] },
    { name: '宵夜', keywords: ['宵夜', '夜宵', '撸串'] },
    { name: '零食', keywords: ['零食', '薯片', '瓜子', '饼干', '小吃', '甜点', '巧克力'] },
    { name: '饮料', keywords: ['饮料', '奶茶', '咖啡', '可乐', '果汁', '啤酒', '喝酒', '星巴克', '喜茶', '瑞幸', '蜜雪', '柠檬茶'] },
    { name: '买菜', keywords: ['买菜', '蔬菜', '猪肉', '牛肉', '排骨', '鸡肉', '鱼虾', '鸡蛋', '肉', '羊肉', '五花肉', '青菜', '白菜', '萝卜', '西红柿'] },
    { name: '水果', keywords: ['水果', '苹果', '香蕉', '西瓜', '葡萄', '草莓', '芒果', '橘子', '梨', '樱桃'] },
    { name: '奶类', keywords: ['牛奶', '酸奶', '奶粉', '鲜奶', '豆奶'] },
    { name: '外卖', keywords: ['外卖'] },
    { name: '聚餐', keywords: ['聚餐', '火锅', '烧烤', '食堂', '饭馆', '宴请', '下馆子', '海底捞', '烤肉'] }
  ]},
  { name: '交通', icon: '🚗', subs: [
    { name: '打车', keywords: ['打车', '滴滴', '出租车', '快车', '网约车', '叫车', '的士', '打车费'] },
    { name: '公交地铁', keywords: ['地铁', '公交', '公交车', '公交卡', '地铁票', '出行'] },
    { name: '加油', keywords: ['加油', '油费', '加汽油'] },
    { name: '停车', keywords: ['停车', '停车费', '过路费', 'ETC'] },
    { name: '火车机票', keywords: ['火车', '高铁', '动车', '机票', '飞机', '航班', '12306'] },
    { name: '骑行', keywords: ['共享单车', '骑行', '单车', '摩拜', '哈啰'] }
  ]},
  { name: '住房', icon: '🏠', subs: [
    { name: '房租', keywords: ['房租', '租金', '房贷', '按揭'] },
    { name: '水电燃气', keywords: ['水电', '水费', '电费', '燃气', '煤气'] },
    { name: '物业网费', keywords: ['物业', '网费', '宽带', 'WiFi'] },
    { name: '家居维修', keywords: ['维修', '装修', '家具', '暖气', '家居', '家电维修', '换锁'] }
  ]},
  { name: '日用购物', icon: '🛒', subs: [
    { name: '衣服鞋帽', keywords: ['衣服', '裤子', '鞋子', '裙子', '外套', 'T恤', '衬衫', '童装', '衣帽', '运动鞋', '袜子', '内衣', '羽绒服', '牛仔裤', '帽子', '围巾'] },
    { name: '日用品', keywords: ['日用品', '纸巾', '洗发水', '牙膏', '洗衣液', '洗洁精', '卫生纸', '牙刷', '毛巾'] },
    { name: '数码家电', keywords: ['手机', '电脑', '数码', '电器', '耳机', '充电器', '键盘', '鼠标', '家电', 'iPad', 'iPhone', '华为', '小米', '冰箱', '洗衣机', '空调', '电视'] },
    { name: '化妆品', keywords: ['化妆品', '护肤品', '口红', '面膜', '香水', '洗面奶', '精华', '面霜'] },
    { name: '超市网购', keywords: ['超市', '网购', '淘宝', '京东', '拼多多', '快递', '运费', '美团', '外卖自取'] }
  ]},
  { name: '社交娱乐', icon: '🎮', subs: [
    { name: '请客送礼', keywords: ['请客', '送礼', '红包', '生日礼物', '份子', '随礼', '结婚礼'] },
    { name: '电影演出', keywords: ['电影', '演出', '门票', '演唱会', '话剧', '音乐节', '影院'] },
    { name: '游戏充值', keywords: ['游戏', '充值', '点卡', '手游', 'Steam', 'PS5', 'Switch', '王者荣耀', '原神', '皮肤', '游戏币'] },
    { name: '旅游出行', keywords: ['旅游', '旅行', '酒店', '景点', '游玩', '景区', '门票', '民宿', '度假'] },
    { name: '聚会KTV', keywords: ['聚会', 'KTV', '唱k', '唱歌', '酒吧', '桌游', '剧本杀', '密室'] }
  ]},
  { name: '医疗', icon: '💊', subs: [
    { name: '药品', keywords: ['买药', '药品', '感冒药', '退烧药', '药店', '药', '药房', '止痛药', '消炎药', '创可贴', '维生素'] },
    { name: '看病', keywords: ['看病', '医院', '挂号', '门诊', '诊所', '急诊', '住院', '手术'] },
    { name: '体检', keywords: ['体检', '检查', '化验', 'CT', '核磁'] },
    { name: '牙科', keywords: ['牙科', '看牙', '洗牙', '补牙', '拔牙', '种牙'] }
  ]},
  { name: '教育', icon: '📚', subs: [
    { name: '书籍', keywords: ['买书', '书籍', '书本', '电子书', 'kindle', '小说', '教材'] },
    { name: '课程培训', keywords: ['课程', '培训', '学费', '辅导', '网课', '补习', '家教', '考研', '考试费'] }
  ]},
  { name: '母婴宠物', icon: '🧸', subs: [
    // 新增"母婴玩具"小类，把玩具/儿童玩具相关都纳进来
    { name: '母婴玩具', keywords: ['奶粉', '尿布', '纸尿裤', '婴儿', '玩具', '儿童玩具', '玩具车', '积木', '芭比', '童装', '童书', '婴儿车', '奶瓶', '学步车', '绘本', '母婴', '乐高', '毛绒玩具', '公仔', '拼图', '洋娃娃'] },
    { name: '宠物', keywords: ['宠物', '猫粮', '狗粮', '猫砂', '宠物用品', '宠物医院', '仓鼠', '宠物店', '猫罐头', '狗零食', '猫窝'] }
  ]},
  { name: '其他支出', icon: '📌', subs: [
    { name: '其他', keywords: ['其他'] }
  ]}
];

/** 默认收入分类（两级结构） */
const DEFAULT_INCOME_CATEGORIES = [
  { name: '薪资收入', icon: '💰', subs: [
    { name: '工资', keywords: ['工资', '薪水', '发工资', '薪资'] },
    { name: '绩效奖金', keywords: ['绩效', '奖金', '年终奖'] }
  ]},
  { name: '投资收益', icon: '📈', subs: [
    { name: '理财利息', keywords: ['理财', '利息', '基金', '股票', '分红', '收益'] }
  ]},
  { name: '报销回款', icon: '📋', subs: [
    { name: '报销', keywords: ['报销'] },
    { name: '回款提成', keywords: ['回款', '提成', '退款'] }
  ]},
  { name: '兼职收入', icon: '💼', subs: [
    { name: '兼职副业', keywords: ['兼职', '副业', '外快', '稿费'] }
  ]},
  { name: '其他收入', icon: '💵', subs: [
    { name: '红包转账', keywords: ['红包', '转账', '收到'] }
  ]}
];

/** 收入关键词（用于收支判断） */
const INCOME_KEYWORDS = ['收到', '工资', '奖金', '报销', '回款', '提成', '退款', '收入', '入账', '赚', '利息', '分红', '绩效', '年终奖', '兼职工资'];

/** 分类关键词→名称映射表（运行时动态构建，含用户记忆） */
let expenseKeywordMap = {};
let incomeKeywordMap = {};

/** 用户自定义分类（运行时加载自 IndexedDB） */
let userExpenseCategories = [];
let userIncomeCategories = [];

// ============================================================
// 二、IndexedDB 数据库操作
// ============================================================

/** IndexedDB 数据库实例（懒加载） */
let db = null;

/**
 * 打开/初始化 IndexedDB 数据库
 * v2 升级：新增 trash 与 keywordCategoryMap 两个对象仓库
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // 数据库首次创建或版本升级时触发
    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // 账单表
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('dateType', ['date', 'type'], { unique: false });
      }
      // 设置表
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
      // 回收站表（v2 新增）
      if (!database.objectStoreNames.contains(TRASH_STORE)) {
        const trash = database.createObjectStore(TRASH_STORE, { keyPath: 'id', autoIncrement: true });
        trash.createIndex('deletedAt', 'deletedAt', { unique: false });
      }
      // 关键词→分类记忆表（v2 新增）
      if (!database.objectStoreNames.contains(KEYWORD_STORE)) {
        database.createObjectStore(KEYWORD_STORE, { keyPath: 'keyword' });
      }
    };

    request.onsuccess = (event) => { db = event.target.result; resolve(db); };
    request.onerror = (event) => { console.error('[DB] 打开失败:', event.target.error); reject(event.target.error); };
  });
}

/** 通用：获取指定仓库 */
async function getStore(storeName, mode = 'readonly') {
  const database = await openDB();
  const tx = database.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

/** 新增账单，返回新 id */
async function addBill(bill) {
  const store = await getStore(STORE_NAME, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.add({ ...bill, createdAt: Date.now() });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 更新账单 */
async function updateBill(bill) {
  const store = await getStore(STORE_NAME, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(bill);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 按 id 获取单条账单 */
async function getBillById(id) {
  const store = await getStore(STORE_NAME, 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 物理删除账单（内部使用；业务删除请用 moveBillToTrash） */
async function deleteBill(id) {
  const store = await getStore(STORE_NAME, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** 查询账单列表（支持日期/类型筛选，按日期倒序） */
async function getBills(options = {}) {
  const { dateStart, dateEnd, type } = options;
  const store = await getStore(STORE_NAME, 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      let bills = request.result;
      if (dateStart) bills = bills.filter(b => b.date >= dateStart);
      if (dateEnd) bills = bills.filter(b => b.date <= dateEnd);
      if (type) bills = bills.filter(b => b.type === type);
      bills.sort((a, b) => (a.date !== b.date) ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt);
      resolve(bills);
    };
    request.onerror = () => reject(request.error);
  });
}

/** 清空所有账单（危险操作） */
async function clearAllBills() {
  const store = await getStore(STORE_NAME, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** 读取设置值 */
async function getSetting(key, defaultValue = null) {
  try {
    const store = await getStore('settings', 'readonly');
    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : defaultValue);
      request.onerror = () => resolve(defaultValue);
    });
  } catch (e) { return defaultValue; }
}

/** 保存设置值 */
async function setSetting(key, value) {
  const store = await getStore('settings', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/* ---------- 回收站操作 ---------- */

/** 移入回收站 */
async function addToTrash(bill) {
  const store = await getStore(TRASH_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.add({ ...bill, deletedAt: Date.now() });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 获取回收站全部（按删除时间倒序） */
async function getAllTrash() {
  const store = await getStore(TRASH_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result.sort((a, b) => b.deletedAt - a.deletedAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

/** 按 id 获取回收站条目 */
async function getTrashById(id) {
  const store = await getStore(TRASH_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 从回收站删除（永久删除） */
async function deleteFromTrash(id) {
  const store = await getStore(TRASH_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 业务删除：把账单移入回收站（保留 7 天）
 * @param {number} id 账单 id
 */
async function moveBillToTrash(id) {
  const bill = await getBillById(id);
  if (!bill) return;
  const { id: _omit, ...billData } = bill; // 去掉原 id，回收站自增新 id
  await addToTrash(billData);
  await deleteBill(id);
}

/** 从回收站恢复账单 */
async function restoreFromTrash(trashId) {
  const item = await getTrashById(trashId);
  if (!item) return;
  const { id, deletedAt, ...billData } = item;
  await addBill(billData); // 生成新账单 id
  await deleteFromTrash(trashId);
}

/** 清理超过 7 天的回收站数据 */
async function cleanExpiredTrash() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const all = await getAllTrash();
  for (const item of all) {
    if (item.deletedAt < sevenDaysAgo) {
      await deleteFromTrash(item.id);
    }
  }
}

/* ---------- 智能分类记忆操作 ---------- */

/** 写入关键词→分类记忆（含小类与大类） */
async function setKeywordCategory(keyword, category, parentCategory, categoryIcon, type) {
  const store = await getStore(KEYWORD_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put({ keyword, category, parentCategory, categoryIcon, type });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** 读取全部分类记忆 */
async function getAllKeywordCategories() {
  const store = await getStore(KEYWORD_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// 三、中文数字解析器
// ============================================================

/**
 * 解析中文数字字符串为阿拉伯数字
 * 支持："五十"→50 "一百五"→150 "一千二"→1200 "两百零五"→205 "一万二千三"→12300 等
 * @param {string} str
 * @returns {number|null}
 */
function parseChineseNumber(str) {
  const digits = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const cleaned = str.replace(/[^零一二两三四五六七八九十百千万亿]/g, '');
  if (!cleaned) return null;

  let result = 0, section = 0, num = 0, prevUnit = null, zeroSeen = false;

  for (const ch of cleaned) {
    const d = digits[ch];
    if (d !== undefined) {
      if (d === 0) { zeroSeen = true; num = 0; }
      else {
        if (zeroSeen) { prevUnit = null; zeroSeen = false; }
        num = d;
      }
    } else if (ch === '十') {
      if (num === 0) num = 1;
      section += num * 10; num = 0; prevUnit = '十'; zeroSeen = false;
    } else if (ch === '百') {
      if (num === 0) num = 1;
      section += num * 100; num = 0; prevUnit = '百'; zeroSeen = false;
    } else if (ch === '千') {
      if (num === 0) num = 1;
      section += num * 1000; num = 0; prevUnit = '千'; zeroSeen = false;
    } else if (ch === '万') {
      section += num; result += section * 10000; section = 0; num = 0; prevUnit = '万'; zeroSeen = false;
    } else if (ch === '亿') {
      section += num; result += section * 10000; result *= 100000000; section = 0; num = 0; prevUnit = '亿'; zeroSeen = false;
    }
  }

  // 处理末尾省略单位（"一百五"→150 "一千二"→1200）
  if (num > 0 && prevUnit) {
    const nextMultiplier = { '百': 10, '千': 100, '万': 1000, '亿': 10000 };
    if (prevUnit in nextMultiplier) num *= nextMultiplier[prevUnit];
  }
  return result + section + num;
}

// ============================================================
// 四、金额提取
// ============================================================

/**
 * 从文本提取金额（支持阿拉伯数字与中文数字，自动跳过"数字+量词"如 两斤/三个/一杯）
 * @returns {{amount:number, remainder:string}|null}
 */
function extractAmount(text) {
  // 1. 优先匹配阿拉伯数字（含小数点）
  const arabicMatch = text.match(/(\d+(?:\.\d+)?)\s*[元块]?/);
  if (arabicMatch) {
    const amount = parseFloat(arabicMatch[1]);
    if (!isNaN(amount) && amount > 0) {
      return { amount, remainder: text.replace(arabicMatch[0], '').trim() };
    }
  }
  // 2. 匹配中文数字，跳过"数字+量词"（那是数量不是金额）
  const MEASURE_WORDS = ['斤', '个', '杯', '瓶', '件', '双', '只', '支', '张', '袋', '盒', '箱', '趟', '次', '克', '千', '米'];
  const cnRegex = /[零一二两三四五六七八九十百千万]+/g;
  let m;
  while ((m = cnRegex.exec(text)) !== null) {
    const start = m.index;
    const matched = m[0];
    const afterChar = text[start + matched.length];
    // 关键修复：跳过量词时，把 lastIndex 跳到量词字符之后，让下次匹配从那里开始
    // 否则 "两斤肉五十" 跳过"两"后 lastIndex 落在"斤"上，整个后续匹配失败
    if (afterChar && MEASURE_WORDS.includes(afterChar)) {
      cnRegex.lastIndex = start + matched.length + 1;  // 跳过量词字符
      continue;
    }
    const amount = parseChineseNumber(matched);
    if (amount !== null && amount > 0 && amount < 100000000) {
      return { amount, remainder: text.replace(matched, '').replace(/[元块]/g, '').trim() };
    }
  }
  return null;
}

// ============================================================
// 五、日期解析器
// ============================================================

/** 今天日期字符串 YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 日期格式化 YYYY-MM-DD */
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 日期加减天数 */
function addDays(base, days) {
  const d = base instanceof Date ? new Date(base) : new Date(base);
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

/** 最近的指定星期几（0=周日） */
function getRecentWeekday(targetDay, from = new Date()) {
  const d = new Date(from);
  const currentDay = d.getDay();
  let diff = targetDay - currentDay;
  if (diff > 0) diff -= 7;
  d.setDate(d.getDate() + diff);
  return fmtDate(d);
}

/** 星期映射表 */
const WEEKDAY_MAP = {
  '周一': 1, '星期二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6,
  '星期日': 0, '星期天': 0, '周日': 0,
  '礼拜一': 1, '礼拜二': 2, '礼拜三': 3, '礼拜四': 4, '礼拜五': 5, '礼拜六': 6, '礼拜天': 0
};

/**
 * 从文本解析日期（相对 + 绝对）
 * @returns {{date:string, remainder:string}}
 */
function parseDate(text) {
  const now = new Date();
  const today = todayStr();

  if (/大前天/.test(text)) return { date: addDays(now, -3), remainder: text.replace(/大前天/g, '').trim() };
  if (/前天/.test(text)) return { date: addDays(now, -2), remainder: text.replace(/前天/g, '').trim() };
  if (/昨天/.test(text)) return { date: addDays(now, -1), remainder: text.replace(/昨天/g, '').trim() };
  // 注：移除"中午"——它更多用作午饭描述（"中午吃饭"），避免与分类识别冲突
  if (/今天|今早|晚上|今晚/.test(text)) return { date: today, remainder: text.replace(/今天|今早|晚上|今晚/g, '').trim() };
  if (/明天/.test(text)) return { date: addDays(now, 1), remainder: text.replace(/明天/g, '').trim() };

  const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
  const lastWeekMatch = text.match(/上周(一|二|三|四|五|六|日|天)/);
  if (lastWeekMatch) {
    const targetDay = dayMap[lastWeekMatch[1]];
    const thisMonday = new Date(now);
    thisMonday.setDate(thisMonday.getDate() - (thisMonday.getDay() === 0 ? 6 : thisMonday.getDay() - 1));
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7 + targetDay - 1);
    return { date: fmtDate(lastMonday), remainder: text.replace(lastWeekMatch[0], '').trim() };
  }
  const thisWeekMatch = text.match(/本周(一|二|三|四|五|六|日|天)/);
  if (thisWeekMatch) {
    const targetDay = dayMap[thisWeekMatch[1]];
    const thisMonday = new Date(now);
    thisMonday.setDate(thisMonday.getDate() - (thisMonday.getDay() === 0 ? 6 : thisMonday.getDay() - 1));
    const target = new Date(thisMonday);
    target.setDate(target.getDate() + targetDay - 1);
    return { date: fmtDate(target), remainder: text.replace(thisWeekMatch[0], '').trim() };
  }
  for (const [key, dayNum] of Object.entries(WEEKDAY_MAP)) {
    if (text.includes(key)) return { date: getRecentWeekday(dayNum, now), remainder: text.replace(key, '').trim() };
  }
  if (/上月/.test(text)) {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { date: fmtDate(lastMonth), remainder: text.replace(/上月/g, '').trim() };
  }

  const mdMatch = text.match(/(\d{1,2})月(\d{1,2})[号日]/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1]), day = parseInt(mdMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: `${now.getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, remainder: text.replace(mdMatch[0], '').trim() };
    }
  }
  const ymdMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})[号日]/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1]), month = parseInt(ymdMatch[2]), day = parseInt(ymdMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, remainder: text.replace(ymdMatch[0], '').trim() };
    }
  }
  const dotMatch = text.match(/(\d{1,2})\.(\d{1,2})/);
  if (dotMatch) {
    const month = parseInt(dotMatch[1]), day = parseInt(dotMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: `${now.getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, remainder: text.replace(dotMatch[0], '').trim() };
    }
  }
  return { date: today, remainder: text };
}

// ============================================================
// 六、分类匹配（含智能记忆）
// ============================================================

/** 构建关键词映射：keyword → { name(小类), parent(大类), icon } */
function buildKeywordMaps() {
  expenseKeywordMap = {};
  incomeKeywordMap = {};
  const fill = (cats, map) => {
    for (const parent of cats) {
      for (const sub of (parent.subs || [])) {
        const icon = sub.icon || parent.icon;
        // 小类名本身也是关键词
        map[sub.name] = { name: sub.name, parent: parent.name, icon };
        for (const kw of (sub.keywords || [])) {
          map[kw] = { name: sub.name, parent: parent.name, icon };
        }
      }
    }
  };
  fill(DEFAULT_EXPENSE_CATEGORIES, expenseKeywordMap);
  fill(userExpenseCategories, expenseKeywordMap);
  fill(DEFAULT_INCOME_CATEGORIES, incomeKeywordMap);
  fill(userIncomeCategories, incomeKeywordMap);
}

/** 加载用户的分类记忆，覆盖到映射表（记忆优先，含大类信息） */
async function loadKeywordMemory() {
  try {
    const memories = await getAllKeywordCategories();
    for (const item of memories) {
      const map = item.type === 'income' ? incomeKeywordMap : expenseKeywordMap;
      map[item.keyword] = { name: item.category, parent: item.parentCategory || item.category, icon: item.categoryIcon };
    }
    if (memories.length) console.log(`[记忆] 加载 ${memories.length} 条分类记忆`);
  } catch (e) { console.warn('[记忆] 加载失败:', e); }
}

/**
 * 记住用户手动修改后的分类（备注关键词 → 小类+大类）
 */
async function rememberCategory(note, category, parentCategory, categoryIcon, type) {
  const keyword = (note || '').trim().slice(0, 6); // 取备注前 6 字作为关键词
  if (keyword.length < 2 || !category) return;
  try {
    await setKeywordCategory(keyword, category, parentCategory, categoryIcon, type);
    const map = type === 'income' ? incomeKeywordMap : expenseKeywordMap;
    map[keyword] = { name: category, parent: parentCategory, icon: categoryIcon };
    console.log(`[记忆] 已记住 "${keyword}" → "${parentCategory}·${category}"`);
  } catch (e) { console.warn('[记忆] 保存失败:', e); }
}

/**
 * 多候选打分匹配分类（提升识别准确率）
 * 策略：
 *   1. 提取所有候选关键词及其命中位置
 *   2. 按"长度×3 + 小类名加权20 + 动作动词后加权15 - 句首句末减分"计算分数
 *   3. 取分数最高的候选返回
 *   4. 当有"小类名本身"作为关键词命中时（例"玩具"作为母婴玩具），分数最高
 *
 * 解决了："买儿童玩具 50" 误判为"买菜/聚餐"——因为"买菜"是"菜"在小类名"买菜"中，
 * 现在的算法会同时考虑"玩具"（母婴玩具）和"买菜"（餐饮），按位置+小类名加权，
 * "玩具"在前且为完整小类名，会胜出。
 */
function matchCategory(text, type) {
  const map = type === 'income' ? incomeKeywordMap : expenseKeywordMap;
  const candidates = [];

  // 动作动词集合（前面有这些词说明后面紧跟的是真正分类名词）
  const ACTION_VERBS = /^(买|买了|买个|买了个|花了|用了|消费|花了下|花销|支出|买了下)/;

  for (const [keyword, info] of Object.entries(map)) {
    // 找出所有命中位置，取最相关的一个
    let idx = text.indexOf(keyword);
    if (idx === -1) continue;

    let score = 0;

    // 1. 关键词长度权重（长关键词更精确），基础分
    score += keyword.length * 3;

    // 2. 小类名本身作为关键词时（强信号）：用户说"玩具"就是母婴玩具，说"游戏"就是游戏
    if (keyword === info.name) score += 25;

    // 3. 位置权重：紧跟"买了/花了"等动作动词后得分高
    if (idx > 0) {
      const before = text.slice(Math.max(0, idx - 6), idx);
      if (ACTION_VERBS.test(before)) score += 12;
    }

    // 4. 句子开头位置（容易被否定/疑问覆盖）：微减
    if (idx === 0) score -= 5;

    // 5. 单字关键词的折扣（避免"吃"等过于宽泛的字误命中，但保留"肉/药/游戏"等有意义单字）
    if (keyword.length === 1) score -= 3;

    candidates.push({ keyword, info, idx, score });
  }

  if (!candidates.length) return null;

  // 按分数降序，取最高
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].info;
}

/**
 * 获取某类型全部分类（两级：大类列表，每大类含合并后的 subs）
 * 默认分类 + 用户自定义分类（同名大类的 subs 合并去重）
 */
function getAllCategories(type) {
  const defaults = type === 'expense' ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
  const users = type === 'expense' ? userExpenseCategories : userIncomeCategories;
  const map = new Map();
  for (const p of [...defaults, ...users]) {
    if (!map.has(p.name)) map.set(p.name, { name: p.name, icon: p.icon, subs: [] });
    const target = map.get(p.name);
    for (const s of (p.subs || [])) {
      if (!target.subs.some(x => x.name === s.name)) {
        target.subs.push({ name: s.name, icon: s.icon || p.icon, keywords: s.keywords || [] });
      }
    }
  }
  return [...map.values()];
}

/** 规范化用户自定义分类为两级结构（兼容旧版一级数据） */
function normalizeUserCats(cats) {
  return (cats || []).map(c => {
    if (c.subs) return c; // 已是两级结构
    // 旧版一级结构 → 转为独立大类，自身作为唯一小类
    return { name: c.name, icon: c.icon || '📌', subs: [{ name: c.name, icon: c.icon || '📌', keywords: c.keywords || [c.name] }] };
  });
}

// ============================================================
// 七、收支判断
// ============================================================

function determineType(text) {
  for (const kw of INCOME_KEYWORDS) if (text.includes(kw)) return 'income';
  return 'expense';
}

// ============================================================
// 八、完整语义解析器
// ============================================================

/**
 * 解析文本为账单结构
 * @returns {{type,amount,date,category,categoryIcon,note,raw}|null}
 */
function parseBillText(text) {
  if (!text || !text.trim()) return null;
  let working = text.trim();
  const result = { type: 'expense', amount: null, date: todayStr(), category: null, parentCategory: null, categoryIcon: null, note: '', raw: text };

  result.type = determineType(working);

  const amountResult = extractAmount(working);
  if (amountResult) { result.amount = amountResult.amount; working = amountResult.remainder; }

  const dateResult = parseDate(working);
  result.date = dateResult.date; working = dateResult.remainder;

  const cat = matchCategory(working, result.type);
  if (cat) { result.category = cat.name; result.parentCategory = cat.parent; result.categoryIcon = cat.icon; }

  let note = working.replace(/花了?|用了?|消费|付款|收款|收到|到账/g, '').replace(/了$/g, '').trim();
  if (/^\d+(\.\d+)?$/.test(note)) note = '';
  result.note = note;
  return result;
}

// ============================================================
// 九、语音识别（按住说话 / 松开发送 / 滑出取消 / 超时 / 实时预览）
// ============================================================

let recognition = null;          // 识别器实例
let isRecording = false;         // 是否已真正开始录音
let isPressing = false;          // 手指是否按住按钮
let slideOut = false;            // 是否滑出按钮区域（取消）
let lastTranscript = '';         // 最近识别文本
let resultHandled = false;       // 结果是否已处理
let cancelled = false;           // 本次录音是否被取消
let pressTimer = null;           // 150ms 防误触定时器
let recordTimeout = null;        // 8秒超时定时器
let recordSession = 0;           // 录音会话 id（防止旧回调干扰）

const PRESS_THRESHOLD = 150;     // 防误触阈值(ms)
const RECORD_MAX_DURATION = 8000; // 录音超时(ms)

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** 安全震动 */
function vibrate(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}

/** 初始化识别器（绑定会话 id） */
function initSpeechRecognition(sessionId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const rec = new SpeechRecognition();
  rec.lang = 'zh-CN';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    if (cancelled || sessionId !== recordSession) return;
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
    lastTranscript = transcript;
    // 实时预览（按钮上方大字）
    const liveEl = document.getElementById('voice-text');
    if (liveEl) liveEl.textContent = transcript;
    const lastResult = event.results[event.results.length - 1];
    if (lastResult.isFinal && !resultHandled) {
      resultHandled = true;
      handleVoiceResult(transcript);
    }
  };

  rec.onerror = (event) => {
    if (cancelled || sessionId !== recordSession) return;
    console.error('[语音] 错误:', event.error);
    const voiceHint = document.getElementById('voice-hint');
    let hintMsg = '识别失败，请重试';
    switch (event.error) {
      case 'not-allowed': case 'service-not-allowed':
        hintMsg = '麦克风权限被拒，请手动输入'; showToast('请允许麦克风权限', 'warning', 3000); break;
      case 'no-speech': hintMsg = '未检测到语音，请重试'; break;
      case 'audio-capture': hintMsg = '未检测到麦克风设备'; showToast('未找到麦克风', 'error'); break;
      case 'network': hintMsg = '语音服务暂不可用，请手动输入'; showToast('语音识别依赖 Google 服务，当前网络下不可用，请使用手动输入', 'warning', 4000); break;
      case 'aborted': hintMsg = '按住说话，松开发送，滑出取消'; break;
      default: hintMsg = '识别失败，请手动输入';
    }
    if (voiceHint) voiceHint.textContent = hintMsg;
    if (lastTranscript && !resultHandled) { resultHandled = true; handleVoiceResult(lastTranscript); }
    stopRecordingUI();
  };

  rec.onend = () => {
    if (sessionId !== recordSession) return;
    if (cancelled) { cancelled = false; return; }
    // 兜底：onend 时若最终结果未处理，补处理
    if (lastTranscript && !resultHandled) { resultHandled = true; handleVoiceResult(lastTranscript); }
    stopRecordingUI();
  };

  rec.onstart = () => { lastTranscript = ''; resultHandled = false; };
  return rec;
}

/** 判断指针是否仍在按钮区域内（含少量容差） */
function isPointerOnButton(x, y) {
  const btn = document.getElementById('voice-btn');
  if (!btn) return true;
  const rect = btn.getBoundingClientRect();
  const pad = 12;
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
}

/** 按下开始（含 150ms 防误触） */
function onVoicePressStart(e) {
  e.preventDefault();
  if (!navigator.onLine) { showToast('离线中，暂不支持语音', 'warning'); return; }
  if (!isSpeechSupported()) { showToast('当前浏览器不支持语音', 'error'); return; }
  if (isRecording || isPressing) return;

  isPressing = true;
  slideOut = false;
  const btn = document.getElementById('voice-btn');
  if (btn) btn.classList.add('pressing');

  // 150ms 防误触阈值后才真正开始录音
  pressTimer = setTimeout(() => {
    if (isPressing) beginRecording();
  }, PRESS_THRESHOLD);
}

/** 手指移动：检测是否滑出按钮区域 */
function onVoicePressMove(e) {
  if (!isPressing) return;
  const point = e.touches ? e.touches[0] : e;
  slideOut = !isPointerOnButton(point.clientX, point.clientY);
  const voiceHint = document.getElementById('voice-hint');
  if (voiceHint && isRecording) {
    if (slideOut) { voiceHint.textContent = '松开手指，取消'; voiceHint.classList.add('warn'); }
    else { voiceHint.textContent = '松开发送'; voiceHint.classList.remove('warn'); }
  }
}

/** 松开结束：区域内发送 / 区域外取消 */
function onVoicePressEnd(e) {
  if (!isPressing) return;
  isPressing = false;
  clearTimeout(pressTimer);
  const btn = document.getElementById('voice-btn');
  if (btn) btn.classList.remove('pressing');

  // 未达阈值就松开（误触）
  if (!isRecording) { resetVoiceHint(); return; }

  if (slideOut) cancelRecording();
  else finishRecording();
}

/** 手指取消（如来电中断） */
function onVoicePressCancel() {
  if (!isPressing) return;
  isPressing = false;
  clearTimeout(pressTimer);
  if (isRecording) cancelRecording();
}

/** 真正开始录音（阈值后触发） */
function beginRecording() {
  recordSession++;
  const sid = recordSession;
  recognition = initSpeechRecognition(sid);
  if (!recognition) { showToast('当前浏览器不支持语音', 'error'); return; }

  isRecording = true;
  cancelled = false;
  lastTranscript = '';
  resultHandled = false;

  // 触觉反馈 + UI
  vibrate(10);
  const btn = document.getElementById('voice-btn');
  const halo = document.getElementById('voice-halo');
  const waves = document.getElementById('voice-waves');
  const liveEl = document.getElementById('voice-text');
  const voiceHint = document.getElementById('voice-hint');
  if (btn) btn.classList.add('recording');
  if (halo) halo.classList.add('breathing');
  if (waves) waves.classList.add('active');
  if (liveEl) liveEl.textContent = '';
  if (voiceHint) { voiceHint.textContent = '松开发送，滑出取消'; voiceHint.classList.remove('warn'); }

  try { recognition.start(); } catch (err) {
    console.error('[语音] 启动失败:', err);
    stopRecordingUI();
    return;
  }

  // 8 秒超时自动停止
  clearTimeout(recordTimeout);
  recordTimeout = setTimeout(() => {
    if (isRecording && recognition && sid === recordSession) {
      showToast('录音超时，自动结束', 'warning');
      try { recognition.stop(); } catch (e) {}
    }
  }, RECORD_MAX_DURATION);
}

/** 完成录音（区域内松开）：停止并等待解析 */
function finishRecording() {
  clearTimeout(recordTimeout);
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  // UI 恢复在 onend 的 stopRecordingUI 中完成；此处先复位标志
  isRecording = false;
  resetVoiceHint();
}

/** 取消录音（滑出松开）：中止且不解析 */
function cancelRecording() {
  clearTimeout(recordTimeout);
  cancelled = true;
  vibrate([10, 30, 10]);
  if (recognition) { try { recognition.abort(); } catch (e) {} }
  isRecording = false;
  stopRecordingUI();
  const liveEl = document.getElementById('voice-text');
  if (liveEl) liveEl.textContent = '';
  showToast('已取消', 'warning');
}

/** 停止录音 UI 复位 */
function stopRecordingUI() {
  clearTimeout(recordTimeout);
  isRecording = false;
  const btn = document.getElementById('voice-btn');
  const halo = document.getElementById('voice-halo');
  const waves = document.getElementById('voice-waves');
  if (btn) btn.classList.remove('recording');
  if (halo) halo.classList.remove('breathing');
  if (waves) waves.classList.remove('active');
  resetVoiceHint();
}

/** 复位提示文字 */
function resetVoiceHint() {
  const voiceHint = document.getElementById('voice-hint');
  if (voiceHint) { voiceHint.textContent = '按住说话，松开发送，滑出取消'; voiceHint.classList.remove('warn'); }
}

/**
 * 处理语音识别结果：
 * - 识别到金额 → 弹出语音胶囊（轻量确认）
 * - 金额未识别 → 降级到完整模态表单
 */
async function handleVoiceResult(text) {
  if (!text || !text.trim()) return;
  console.log('[语音] 处理结果:', text);
  const parsed = parseBillText(text);
  if (!parsed) return;
  console.log('[语音] 解析:', parsed);

  if (parsed.amount !== null) {
    // 有金额 → 语音胶囊（无论分类是否识别，胶囊内可改）
    openVoiceCapsule(parsed);
  } else {
    // 金额完全未识别 → 完整模态表单
    showToast('未识别金额，请完善', 'warning');
    openEditModal(parsed);
  }
}

// ============================================================
// 十、语音胶囊（轻量确认卡片，字段就地编辑）
// ============================================================

/** 当前胶囊数据 */
let capsuleData = null;

/** 打开语音胶囊 */
function openVoiceCapsule(parsed) {
  // 默认选中：已识别的小类，否则第一个大类的第一个小类
  const parents = getAllCategories(parsed.type);
  const firstParent = parents[0];
  const firstSub = firstParent.subs[0];

  capsuleData = {
    type: parsed.type,
    amount: parsed.amount,
    category: parsed.category || firstSub.name,              // 小类
    parentCategory: parsed.parentCategory || firstParent.name, // 大类
    categoryIcon: parsed.categoryIcon || firstParent.icon,
    date: parsed.date,
    note: parsed.note || '',
    initialCategory: parsed.category  // 用于智能记忆对比
  };

  // 类型标签
  const typeTag = document.getElementById('capsule-type-tag');
  typeTag.textContent = capsuleData.type === 'income' ? '收入' : '支出';
  typeTag.classList.toggle('income', capsuleData.type === 'income');

  // 金额
  document.getElementById('capsule-amount').textContent = capsuleData.amount.toFixed(2);
  hideAmountInput();

  // 分类（含两级选择面板，默认收起）
  renderCapsuleCategory();
  hideCapsuleCatPanel();

  // 日期
  document.getElementById('capsule-date').textContent = formatDateLabel(capsuleData.date);
  document.getElementById('capsule-date-input').value = capsuleData.date;

  // 备注
  renderCapsuleNote();

  document.getElementById('capsule-overlay').style.display = 'flex';
}

/** 关闭语音胶囊（作废） */
function closeVoiceCapsule() {
  document.getElementById('capsule-overlay').style.display = 'none';
  capsuleData = null;
  const liveEl = document.getElementById('voice-text');
  if (liveEl) liveEl.textContent = '';
}

/** 渲染胶囊分类显示（大类·小类） */
function renderCapsuleCategory() {
  document.getElementById('capsule-category-icon').textContent = capsuleData.categoryIcon;
  document.getElementById('capsule-category').textContent =
    capsuleData.parentCategory && capsuleData.parentCategory !== capsuleData.category
      ? `${capsuleData.parentCategory}·${capsuleData.category}`
      : capsuleData.category;
}

/** 分类循环切换（左右滑动：在同大类内循环小类） */
function cycleCapsuleCategory(direction) {
  const parents = getAllCategories(capsuleData.type);
  const parent = parents.find(p => p.name === capsuleData.parentCategory) || parents[0];
  const subs = parent.subs;
  if (!subs.length) return;
  const idx = subs.findIndex(s => s.name === capsuleData.category);
  const next = subs[(idx + direction + subs.length) % subs.length];
  capsuleData.category = next.name;
  capsuleData.parentCategory = parent.name;
  capsuleData.categoryIcon = next.icon || parent.icon;
  renderCapsuleCategory();
}

/** 切换胶囊内的两级分类面板显隐 */
function toggleCapsuleCatPanel() {
  const panel = document.getElementById('capsule-cat-panel');
  if (!panel) return;
  if (panel.style.display === 'none') {
    renderCapsuleCatPanel();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

/** 隐藏胶囊分类面板 */
function hideCapsuleCatPanel() {
  const panel = document.getElementById('capsule-cat-panel');
  if (panel) panel.style.display = 'none';
}

/** 渲染胶囊内的两级分类选择面板（大类 tabs + 小类 chips） */
function renderCapsuleCatPanel() {
  const panel = document.getElementById('capsule-cat-panel');
  if (!panel || !capsuleData) return;
  renderTwoLevelPicker(panel, capsuleData.type, capsuleData.category, capsuleData.parentCategory, (parent, sub) => {
    capsuleData.category = sub.name;
    capsuleData.parentCategory = parent.name;
    capsuleData.categoryIcon = sub.icon || parent.icon;
    renderCapsuleCategory();
    hideCapsuleCatPanel();
  });
}

/**
 * 通用两级分类选择器渲染
 * @param {HTMLElement} container 容器
 * @param {string} type 收支类型
 * @param {string} selectedSub 当前选中的小类名
 * @param {string} selectedParent 当前选中的大类名
 * @param {Function} onPick 选中小类回调 (parent, sub) => {}
 */
function renderTwoLevelPicker(container, type, selectedSub, selectedParent, onPick) {
  const parents = getAllCategories(type);
  if (!parents.length) return;
  // 初始激活大类：包含 selectedSub 的大类，否则 selectedParent，否则第一个
  let activeParent = parents.find(p => p.subs.some(s => s.name === selectedSub))
    || parents.find(p => p.name === selectedParent)
    || parents[0];

  container.innerHTML = `
    <div class="parent-tabs"></div>
    <div class="sub-chips"></div>
  `;
  const tabsEl = container.querySelector('.parent-tabs');
  const chipsEl = container.querySelector('.sub-chips');

  function renderTabs() {
    tabsEl.innerHTML = parents.map(p => `
      <button class="parent-tab ${p.name === activeParent.name ? 'active' : ''}" data-parent="${escapeHtml(p.name)}">${p.icon} ${escapeHtml(p.name)}</button>
    `).join('');
    tabsEl.querySelectorAll('.parent-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeParent = parents.find(p => p.name === btn.dataset.parent);
        renderTabs();
        renderChips();
      });
    });
  }

  function renderChips() {
    chipsEl.innerHTML = activeParent.subs.map(s => `
      <button class="sub-chip ${s.name === selectedSub && activeParent.name === selectedParent ? 'selected' : ''}" data-sub="${escapeHtml(s.name)}">${s.icon || activeParent.icon} ${escapeHtml(s.name)}</button>
    `).join('');
    chipsEl.querySelectorAll('.sub-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = activeParent.subs.find(s => s.name === btn.dataset.sub);
        if (sub && onPick) onPick(activeParent, sub);
      });
    });
  }

  renderTabs();
  renderChips();
}

/** 渲染胶囊备注 */
function renderCapsuleNote() {
  const noteEl = document.getElementById('capsule-note');
  const input = document.getElementById('capsule-note-input');
  noteEl.style.display = '';
  input.style.display = 'none';
  if (capsuleData.note) { noteEl.textContent = capsuleData.note; noteEl.classList.remove('placeholder'); }
  else { noteEl.textContent = '点击添加备注'; noteEl.classList.add('placeholder'); }
}

/** 显示金额编辑输入框（弹数字键盘） */
function showAmountInput() {
  const wrap = document.getElementById('capsule-amount-wrap');
  const display = document.getElementById('capsule-amount');
  const input = document.getElementById('capsule-amount-input');
  display.style.display = 'none';
  input.style.display = '';
  input.value = capsuleData.amount;
  input.focus();
  input.select();
}

/** 隐藏金额输入框并应用 */
function hideAmountInput(apply = true) {
  const display = document.getElementById('capsule-amount');
  const input = document.getElementById('capsule-amount-input');
  if (apply && input.style.display !== 'none') {
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) capsuleData.amount = val;
  }
  display.textContent = capsuleData.amount.toFixed(2);
  display.style.display = '';
  input.style.display = 'none';
}

/** 显示备注编辑 */
function showNoteInput() {
  const noteEl = document.getElementById('capsule-note');
  const input = document.getElementById('capsule-note-input');
  noteEl.style.display = 'none';
  input.style.display = '';
  input.value = capsuleData.note;
  input.focus();
}

/** 隐藏备注编辑并应用 */
function hideNoteInput() {
  const input = document.getElementById('capsule-note-input');
  if (input.style.display !== 'none') capsuleData.note = input.value.trim();
  renderCapsuleNote();
}

/** 日期显示为友好标签 */
function formatDateLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return '今天';
  if (dateStr === addDays(new Date(), -1)) return '昨天';
  if (dateStr === addDays(new Date(), -2)) return '前天';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 确认保存胶囊 */
async function confirmVoiceCapsule() {
  if (!capsuleData) return;
  // 应用可能未失焦的编辑
  hideAmountInput(true);
  hideNoteInput();

  if (!(capsuleData.amount > 0)) { showToast('请输入有效金额', 'error'); return; }

  // 智能分类记忆：分类被修改过则记录（备注关键词 → 小类+大类）
  if (capsuleData.note && capsuleData.category !== capsuleData.initialCategory) {
    rememberCategory(capsuleData.note, capsuleData.category, capsuleData.parentCategory, capsuleData.categoryIcon, capsuleData.type);
  }

  try {
    // 关键：先取出展示所需数据，避免 closeVoiceCapsule() 置空 capsuleData 后访问报错
    const savedCategory = capsuleData.category;
    const savedAmount = capsuleData.amount;
    const savedDate = capsuleData.date;   // 日期也提前取出，closeVoiceCapsule 后 capsuleData 即为 null

    const id = await addBill({
      type: capsuleData.type,
      amount: capsuleData.amount,
      category: capsuleData.category,              // 小类
      parentCategory: capsuleData.parentCategory,  // 大类
      categoryIcon: capsuleData.categoryIcon,
      date: capsuleData.date,
      note: capsuleData.note
    });
    closeVoiceCapsule();
    showUndoBar(id, `已记录 ${shortDatePrefix(savedDate)}${savedCategory} ¥${savedAmount.toFixed(2)}`);
    refreshHomeSummary();
    if (currentPage === 'list') renderBillList();
  } catch (err) {
    console.error('[胶囊] 保存失败:', err);
    showToast('保存失败，请重试', 'error');
  }
}

// ============================================================
// 十一、快速撤销
// ============================================================

let undoTimer = null;
let lastUndoBillId = null;

/** 非今天的日期转为短标签（如 7/25 ），今天返回空串 */
function shortDatePrefix(dateStr) {
  if (!dateStr || dateStr === todayStr()) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} `;
}

/** 显示撤销提示条（3 秒自动消失） */
function showUndoBar(billId, msg) {
  lastUndoBillId = billId;
  const bar = document.getElementById('undo-bar');
  document.getElementById('undo-text').textContent = `✓ ${msg} · 点击撤销`;
  bar.style.display = 'flex';
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { bar.style.display = 'none'; lastUndoBillId = null; }, 3000);
}

/** 点击撤销：删除最后一笔（移入回收站） */
async function handleUndo() {
  if (!lastUndoBillId) return;
  const id = lastUndoBillId;
  lastUndoBillId = null;
  clearTimeout(undoTimer);
  document.getElementById('undo-bar').style.display = 'none';
  await moveBillToTrash(id);
  showToast('已撤销', 'success');
  refreshHomeSummary();
  if (currentPage === 'list') renderBillList();
  if (currentPage === 'stats') refreshStats();
}

// ============================================================
// 十二、UI 控制器
// ============================================================

let currentPage = 'home';
const PAGE_MAP = { 'home': 'page-home', 'list': 'page-list', 'stats': 'page-stats', 'settings': 'page-settings' };

/** 页面切换（左右滑动动画） */
function navigateTo(targetPage) {
  if (targetPage === currentPage || !PAGE_MAP[targetPage]) return;
  const pageOrder = ['home', 'list', 'stats', 'settings'];
  const direction = pageOrder.indexOf(targetPage) > pageOrder.indexOf(currentPage) ? 'left' : 'right';
  const oldPage = document.getElementById(PAGE_MAP[currentPage]);
  const newPage = document.getElementById(PAGE_MAP[targetPage]);
  if (!oldPage || !newPage) return;

  oldPage.classList.add(direction === 'left' ? 'slide-left' : 'slide-right');
  oldPage.classList.remove('active');
  newPage.classList.add(direction === 'left' ? 'slide-in-left' : 'slide-in-right');
  newPage.classList.add('active');
  newPage.style.display = 'block';

  setTimeout(() => {
    oldPage.style.display = 'none';
    oldPage.classList.remove('slide-left', 'slide-right');
    newPage.classList.remove('slide-in-left', 'slide-in-right');
  }, 300);

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === targetPage));
  currentPage = targetPage;

  // 语音悬浮按钮仅在记账首页显示，其他页面隐藏（带淡出动画）
  const vf = document.getElementById('voice-floating');
  if (vf) vf.classList.toggle('hidden', targetPage !== 'home');

  if (targetPage === 'stats') refreshStats();
  if (targetPage === 'list') renderBillList();
  if (targetPage === 'settings') { renderSettingsCategories(); renderTrash(); }
}

/** Toast 提示 */
function showToast(msg, type = 'success', duration = 2000) {
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  toast.className = `toast ${type}`;
  if (toastIcon) toastIcon.textContent = icons[type] || '';
  toastMsg.textContent = msg;
  toast.style.display = 'flex';
  if (toast._timeout) clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, duration);
}

/** 确认对话框 */
function showConfirm(msg) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    const msgEl = document.getElementById('confirm-msg');
    const cancelBtn = document.getElementById('confirm-cancel');
    const okBtn = document.getElementById('confirm-ok');
    if (!overlay) { resolve(false); return; }
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
    const cleanup = (result) => {
      overlay.style.display = 'none';
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onOk = () => cleanup(true);
    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onOk);
  });
}

// ============================================================
// 十二.五、首页标题自定义编辑
// ============================================================

/** 加载并显示自定义应用标题 */
async function loadAppTitle() {
  const saved = await getSetting('appTitle', '');
  const titleEl = document.getElementById('app-title');
  if (saved && titleEl) titleEl.textContent = saved;
}

/** 绑定标题就地编辑（点击标题 → 输入框 → 失焦/回车保存） */
function bindAppTitleEdit() {
  const titleEl = document.getElementById('app-title');
  const inputEl = document.getElementById('app-title-input');
  if (!titleEl || !inputEl) return;

  titleEl.addEventListener('click', () => {
    inputEl.value = titleEl.textContent.trim();
    titleEl.style.display = 'none';
    inputEl.style.display = '';
    inputEl.focus();
    inputEl.select();
  });

  const saveTitle = async () => {
    const val = inputEl.value.trim() || '极简语音记账';
    titleEl.textContent = val;
    await setSetting('appTitle', val);
    titleEl.style.display = '';
    inputEl.style.display = 'none';
  };

  inputEl.addEventListener('blur', saveTitle);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); inputEl.blur(); }
    if (e.key === 'Escape') { inputEl.style.display = 'none'; titleEl.style.display = ''; }
  });
}

// ============================================================
// 十三、完善账单模态框（预填充 + 就地修改 + 编辑删除按钮）
// ============================================================

let editingBill = null;

/** 打开编辑/完善账单模态框（预填充所有字段） */
function openEditModal(billData = {}) {
  const isEdit = !!billData.id;
  editingBill = isEdit
    ? { ...billData, initialCategory: billData.category }
    : { initialCategory: billData.category || null, ...billData };

  document.getElementById('modal-title').textContent = isEdit ? '编辑账单' : '完善账单';
  const type = billData.type || 'expense';
  setModalType(type);

  // 预填充字段
  document.getElementById('edit-amount').value = billData.amount || '';
  document.getElementById('edit-date').value = billData.date || todayStr();
  document.getElementById('edit-note').value = billData.note || '';
  renderCategoryPicker(type, billData.category, billData.parentCategory);

  // 编辑模式显示删除按钮，新建模式隐藏
  document.getElementById('btn-delete-bill').style.display = isEdit ? 'block' : 'none';
  // 新建模式按钮文案
  document.getElementById('btn-confirm').textContent = isEdit ? '保存修改' : '确认保存';

  document.getElementById('modal-overlay').style.display = 'flex';
}

/** 关闭模态框 */
function closeEditModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  editingBill = null;
}

/** 设置收支类型 */
function setModalType(type) {
  document.getElementById('type-expense-btn').classList.toggle('active', type === 'expense');
  document.getElementById('type-income-btn').classList.toggle('active', type === 'income');
  renderCategoryPicker(type);
}

/** 模态框当前选中的分类 { parent, sub, icon } */
let modalSelectedCat = null;

/** 渲染模态框分类选择器（两级：大类 tabs + 小类 chips） */
function renderCategoryPicker(type, selectedSub = null, selectedParent = null) {
  const picker = document.getElementById('category-picker');
  if (!picker) return;
  const parents = getAllCategories(type);
  if (!parents.length) return;

  // 初始化选中：优先匹配小类，否则匹配大类，否则第一个大类的第一个小类
  const initParent = parents.find(p => p.subs.some(s => s.name === selectedSub))
    || parents.find(p => p.name === selectedParent) || parents[0];
  const initSub = initParent.subs.find(s => s.name === selectedSub) || initParent.subs[0];
  modalSelectedCat = { parent: initParent.name, sub: initSub.name, icon: initSub.icon || initParent.icon };

  const rerender = () => {
    renderTwoLevelPicker(picker, type, modalSelectedCat.sub, modalSelectedCat.parent, (parent, sub) => {
      modalSelectedCat = { parent: parent.name, sub: sub.name, icon: sub.icon || parent.icon };
      rerender();
    });
  };
  rerender();
}

/** 确认保存账单（新建 / 编辑） */
async function confirmSaveBill() {
  const typeBtn = document.querySelector('.type-btn.active');
  const type = typeBtn ? typeBtn.dataset.type : 'expense';
  const amount = parseFloat(document.getElementById('edit-amount').value);
  const date = document.getElementById('edit-date').value;
  const note = document.getElementById('edit-note').value.trim();

  if (isNaN(amount) || amount <= 0) { showToast('请输入有效金额', 'error'); return; }
  if (!modalSelectedCat) { showToast('请选择分类', 'error'); return; }

  const category = modalSelectedCat.sub;          // 小类
  const parentCategory = modalSelectedCat.parent; // 大类
  const icon = modalSelectedCat.icon;

  // 智能分类记忆：用户修改了分类则记录
  if (note && editingBill && category !== editingBill.initialCategory) {
    rememberCategory(note, category, parentCategory, icon, type);
  }

  const billData = { type, amount, category, parentCategory, categoryIcon: icon, date: date || todayStr(), note };

  try {
    if (editingBill && editingBill.id) {
      await updateBill({ ...editingBill, ...billData });
      showToast('账单已更新', 'success');
    } else {
      const id = await addBill(billData);
      showUndoBar(id, `已记录 ${shortDatePrefix(billData.date)}${category} ¥${amount.toFixed(2)}`);
    }
    closeEditModal();
    refreshHomeSummary();
    if (currentPage === 'list') renderBillList();
    if (currentPage === 'stats') refreshStats();
  } catch (err) {
    console.error('[账单] 保存失败:', err);
    showToast('保存失败，请重试', 'error');
  }
}

/** 编辑模态框中删除当前账单（二次确认，移入回收站） */
async function deleteCurrentEditingBill() {
  if (!editingBill || !editingBill.id) return;
  const confirmed = await showConfirm('确定删除这条账单吗？将移入回收站。');
  if (!confirmed) return;
  await moveBillToTrash(editingBill.id);
  closeEditModal();
  showToast('已删除，可在回收站恢复', 'success');
  refreshHomeSummary();
  if (currentPage === 'list') renderBillList();
  if (currentPage === 'stats') refreshStats();
}

// ============================================================
// 十四、首页摘要
// ============================================================

async function refreshHomeSummary() {
  const today = todayStr();
  const bills = await getBills({ dateStart: today, dateEnd: today });
  let totalExpense = 0, totalIncome = 0;
  bills.forEach(b => { if (b.type === 'expense') totalExpense += b.amount; else totalIncome += b.amount; });
  document.getElementById('home-expense').textContent = `¥${totalExpense.toFixed(2)}`;
  document.getElementById('home-income').textContent = `¥${totalIncome.toFixed(2)}`;
  document.getElementById('home-date').textContent =
    `${today} 周${['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()]}`;
}

// ============================================================
// 十五、账单列表（点击编辑 / 左滑删除 / 长按多选）
// ============================================================

let currentFilter = 'month';   // 默认"月"视图：最近记录都可见，避免"记了昨天却以为没存上"
let customDateStart = null;
let customDateEnd = null;
let currentBills = [];             // 当前列表数据（供点击编辑查找）

/** 多选模式状态 */
let isMultiSelect = false;
let selectedIds = new Set();

/** 获取当前筛选日期范围 */
function getFilterDateRange() {
  const today = todayStr();
  const now = new Date();
  switch (currentFilter) {
    case 'day': return { start: today, end: today };
    case 'week': {
      const monday = new Date(now);
      monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
      return { start: fmtDate(monday), end: today };
    }
    case 'month': return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: today };
    case 'custom': return { start: customDateStart || today, end: customDateEnd || today };
    default: return { start: today, end: today };
  }
}

/** 渲染账单列表 */
async function renderBillList() {
  const { start, end } = getFilterDateRange();
  const bills = await getBills({ dateStart: start, dateEnd: end });
  currentBills = bills;
  const listEl = document.getElementById('bill-list');
  const emptyEl = document.getElementById('bill-empty');
  if (!listEl) return;

  // 时段统计
  let totalExpense = 0, totalIncome = 0;
  bills.forEach(b => { if (b.type === 'expense') totalExpense += b.amount; else totalIncome += b.amount; });
  document.getElementById('period-expense').textContent = `¥${totalExpense.toFixed(2)}`;
  document.getElementById('period-income').textContent = `¥${totalIncome.toFixed(2)}`;
  const balanceEl = document.getElementById('period-balance');
  balanceEl.textContent = `¥${(totalIncome - totalExpense).toFixed(2)}`;
  balanceEl.style.color = totalIncome - totalExpense >= 0 ? 'var(--income)' : 'var(--expense)';

  if (bills.length === 0) { listEl.innerHTML = ''; emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';

  listEl.innerHTML = bills.map((bill, index) => {
    // 分类显示：有大类且与小类不同 → "大类·小类"，否则只显示小类（兼容旧数据）
    const catLabel = bill.parentCategory && bill.parentCategory !== bill.category
      ? `${bill.parentCategory}·${bill.category}`
      : bill.category;
    return `
    <div class="bill-card" data-id="${bill.id}">
      <div class="bill-actions">
        <button class="bill-action-btn edit" data-action="edit" data-id="${bill.id}">编辑</button>
        <button class="bill-action-btn delete" data-action="delete" data-id="${bill.id}">删除</button>
      </div>
      <div class="bill-card-inner" data-id="${bill.id}" style="animation: fadeInUp 0.3s ease ${index * 0.04}s both;">
        <div class="bill-checkbox" data-id="${bill.id}"></div>
        <span class="bill-category-icon">${bill.categoryIcon || '💸'}</span>
        <div class="bill-info">
          <div class="bill-category">${escapeHtml(catLabel)}</div>
          ${bill.note ? `<div class="bill-note">${escapeHtml(bill.note)}</div>` : ''}
          <div class="bill-date">${bill.date}</div>
        </div>
        <span class="bill-amount ${bill.type}">${bill.type === 'income' ? '+' : '-'}¥${bill.amount.toFixed(2)}</span>
      </div>
    </div>`;
  }).join('');

  bindBillCardEvents();
}

/** HTML 转义 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 绑定账单卡片事件（左滑 / 点击编辑 / 长按多选） */
function bindBillCardEvents() {
  const listEl = document.getElementById('bill-list');
  let startX = 0, startY = 0, moved = false;
  let swipeCard = null, swipeTranslate = 0;
  let longPressTimer = null, justLongPressed = false;

  listEl.querySelectorAll('.bill-card-inner').forEach(card => {
    const id = parseInt(card.dataset.id);

    // 触摸开始：记录起点 + 启动长按计时
    card.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      moved = false;
      justLongPressed = false;
      if (!isMultiSelect) {
        longPressTimer = setTimeout(() => {
          justLongPressed = true;
          enterMultiSelect(id);
        }, 500);
      }
      // 左滑：若已有打开的卡片先关闭
      if (swipeCard && swipeCard !== card) {
        swipeCard.style.transform = 'translateX(0)';
        const prevCard = swipeCard.closest('.bill-card');
        if (prevCard) prevCard.classList.remove('swiped');
        swipeCard = null;
      }
      swipeCard = card;
      card.style.transition = 'none';
    }, { passive: true });

    // 触摸移动：左滑逻辑 + 取消长按
    card.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { moved = true; clearTimeout(longPressTimer); }
      if (isMultiSelect) return; // 多选模式禁用左滑
      if (swipeCard !== card) return;
      const diff = startX - e.touches[0].clientX;
      if (diff > 0 && diff <= 150) { swipeTranslate = diff; card.style.transform = `translateX(-${diff}px)`; }
    }, { passive: true });

    // 触摸结束：左滑归位 / 清理长按
    card.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
      if (isMultiSelect) return;
      if (swipeCard !== card) return;
      card.style.transition = 'transform 0.3s ease';
      const billCard = card.closest('.bill-card');
      if (swipeTranslate > 60) {
        card.style.transform = 'translateX(-128px)';
        // 给 .bill-card 加 swiped 类，触发 .bill-actions 跟随移回可见并提升 z-index
        if (billCard) billCard.classList.add('swiped');
      } else {
        card.style.transform = 'translateX(0)';
        if (billCard) billCard.classList.remove('swiped');
        swipeCard = null;
      }
      swipeTranslate = 0;
    });

    // 点击：多选切换 或 进入编辑（纯点击，无滑动/长按）
    card.addEventListener('click', () => {
      if (justLongPressed) { justLongPressed = false; return; }
      if (moved) return;
      if (isMultiSelect) { toggleSelect(id, card); return; }
      const bill = currentBills.find(b => b.id === id);
      if (bill) openEditModal(bill);
    });
  });

  // 左滑操作按钮（编辑 / 删除）
  listEl.querySelectorAll('.bill-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id);
      if (action === 'edit') {
        const bill = currentBills.find(b => b.id === id);
        if (bill) openEditModal(bill);
      } else if (action === 'delete') {
        const confirmed = await showConfirm('确定删除这条记录吗？将移入回收站。');
        if (confirmed) await deleteBillWithAnimation(id);
      }
      if (swipeCard) {
        swipeCard.style.transform = 'translateX(0)';
        const bc = swipeCard.closest('.bill-card');
        if (bc) bc.classList.remove('swiped');
        swipeCard = null;
      }
    });
  });
}

/** 带动画删除账单（卡片平滑消失，列表补位） */
async function deleteBillWithAnimation(id) {
  const card = document.querySelector(`.bill-card[data-id="${id}"]`);
  if (card) {
    card.classList.add('removing');
    setTimeout(async () => {
      await moveBillToTrash(id);
      showToast('已删除，可在回收站恢复', 'success');
      renderBillList();
      refreshHomeSummary();
    }, 280);
  } else {
    await moveBillToTrash(id);
    renderBillList();
    refreshHomeSummary();
  }
}

/* ---------- 多选模式 ---------- */

/** 进入多选模式 */
function enterMultiSelect(initialId) {
  isMultiSelect = true;
  selectedIds = new Set([initialId]);
  vibrate(15);
  document.getElementById('bill-list').classList.add('multi-mode');
  document.getElementById('multi-select-bar').style.display = 'flex';
  updateMultiSelectUI();
  showToast('已进入多选，点击卡片勾选', 'warning', 1500);
}

/** 退出多选模式 */
function exitMultiSelect() {
  isMultiSelect = false;
  selectedIds.clear();
  document.getElementById('bill-list').classList.remove('multi-mode');
  document.getElementById('multi-select-bar').style.display = 'none';
  renderBillList();
}

/** 切换某条选中状态 */
function toggleSelect(id, cardInner) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  const card = cardInner.closest('.bill-card');
  const checkbox = cardInner.querySelector('.bill-checkbox');
  if (card) card.classList.toggle('selected', selectedIds.has(id));
  if (checkbox) checkbox.classList.toggle('checked', selectedIds.has(id));
  updateMultiSelectUI();
}

/** 更新多选计数与卡片状态 */
function updateMultiSelectUI() {
  document.getElementById('multi-select-count').textContent = `已选 ${selectedIds.size} 项`;
  document.querySelectorAll('.bill-card').forEach(card => {
    const id = parseInt(card.dataset.id);
    const checked = selectedIds.has(id);
    card.classList.toggle('selected', checked);
    const checkbox = card.querySelector('.bill-checkbox');
    if (checkbox) checkbox.classList.toggle('checked', checked);
  });
}

/** 批量删除（二次确认，逐个移入回收站） */
async function batchDeleteSelected() {
  if (selectedIds.size === 0) { showToast('请先勾选要删除的账单', 'warning'); return; }
  const confirmed = await showConfirm(`确定删除选中的 ${selectedIds.size} 条账单吗？将移入回收站。`);
  if (!confirmed) return;
  for (const id of selectedIds) await moveBillToTrash(id);
  showToast(`已删除 ${selectedIds.size} 条，可在回收站恢复`, 'success');
  exitMultiSelect();
  refreshHomeSummary();
  if (currentPage === 'stats') refreshStats();
}

// ============================================================
// 十六、回收站（设置页）
// ============================================================

/** 渲染回收站列表 */
async function renderTrash() {
  const listEl = document.getElementById('trash-list');
  if (!listEl) return;
  const items = await getAllTrash();

  if (items.length === 0) {
    listEl.innerHTML = '<div class="trash-empty">回收站为空</div>';
    return;
  }

  listEl.innerHTML = items.map(item => {
    const d = new Date(item.deletedAt);
    const delTime = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const catLabel = item.parentCategory && item.parentCategory !== item.category ? `${item.parentCategory}·${item.category}` : item.category;
    return `
      <div class="trash-item" data-id="${item.id}">
        <span class="trash-item-icon">${item.categoryIcon || '💸'}</span>
        <div class="trash-item-info">
          <div class="trash-item-title">${escapeHtml(catLabel)}${item.note ? ' · ' + escapeHtml(item.note) : ''}</div>
          <div class="trash-item-meta">${item.date} · 删除于 ${delTime}</div>
        </div>
        <span class="trash-item-amount ${item.type}">${item.type === 'income' ? '+' : '-'}¥${item.amount.toFixed(2)}</span>
        <div class="trash-item-actions">
          <button class="trash-btn restore" data-action="restore" data-id="${item.id}">恢复</button>
          <button class="trash-btn destroy" data-action="destroy" data-id="${item.id}">彻底删除</button>
        </div>
      </div>
    `;
  }).join('');

  // 绑定恢复 / 彻底删除
  listEl.querySelectorAll('.trash-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      if (btn.dataset.action === 'restore') {
        await restoreFromTrash(id);
        showToast('已恢复账单', 'success');
      } else {
        const confirmed = await showConfirm('彻底删除后不可恢复，确定吗？');
        if (!confirmed) return;
        await deleteFromTrash(id);
        showToast('已彻底删除', 'success');
      }
      renderTrash();
      refreshHomeSummary();
      if (currentPage === 'list') renderBillList();
    });
  });
}

// ============================================================
// 十七、数据统计 & Chart.js 图表
// ============================================================

let pieChart = null;
let lineChart = null;
let statsFilter = 'week';
/** 饼图聚合维度：'parent' 大类 | 'sub' 细分 */
let statsGroupBy = 'parent';

function getStatsDateRange() {
  const today = todayStr();
  const now = new Date();
  switch (statsFilter) {
    case 'week': { const d = new Date(now); d.setDate(d.getDate() - 6); return { start: fmtDate(d), end: today }; }
    case 'month': { const d = new Date(now); d.setMonth(d.getMonth() - 1); return { start: fmtDate(d), end: today }; }
    case 'year': return { start: `${now.getFullYear()}-01-01`, end: today };
    default: return { start: today, end: today };
  }
}

async function refreshStats() {
  const { start, end } = getStatsDateRange();
  const bills = await getBills({ dateStart: start, dateEnd: end });
  let totalExpense = 0, totalIncome = 0;
  const expenseByCategory = {};
  const dailyData = {};
  bills.forEach(b => {
    if (b.type === 'expense') {
      totalExpense += b.amount;
      // 按维度聚合：大类用 parentCategory（旧数据回退 category），细分用 category
      const key = statsGroupBy === 'parent' ? (b.parentCategory || b.category) : b.category;
      expenseByCategory[key] = (expenseByCategory[key] || 0) + b.amount;
    }
    else totalIncome += b.amount;
    dailyData[b.date] = dailyData[b.date] || { expense: 0, income: 0 };
    dailyData[b.date][b.type] += b.amount;
  });
  animateNumber('stats-income', totalIncome);
  animateNumber('stats-expense', totalExpense);
  animateNumber('stats-balance', totalIncome - totalExpense);
  updatePieChart(expenseByCategory);
  updateLineChart(dailyData, start, end);
}

/** 数字滚动动画 */
function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const isBalance = elementId.includes('balance');
  const current = parseFloat(el.textContent.replace(/[^0-9.\-]/g, '')) || 0;
  const diff = target - current;
  const duration = 600;
  const startTime = performance.now();
  function step(ts) {
    const progress = Math.min((ts - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = current + diff * eased;
    if (isBalance) { el.textContent = `${value >= 0 ? '' : '-'}¥${Math.abs(value).toFixed(2)}`; el.style.color = value >= 0 ? 'var(--income)' : 'var(--expense)'; }
    else el.textContent = `¥${value.toFixed(2)}`;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** 饼图：支出分类占比 */
function updatePieChart(expenseByCategory) {
  const ctx = document.getElementById('pie-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  const labels = Object.keys(expenseByCategory);
  const data = Object.values(expenseByCategory);
  if (labels.length === 0) { if (pieChart) { pieChart.destroy(); pieChart = null; } return; }
  const colors = ['rgba(139,92,246,0.8)', 'rgba(99,102,241,0.8)', 'rgba(168,85,247,0.8)', 'rgba(59,130,246,0.8)', 'rgba(236,72,153,0.7)', 'rgba(52,211,153,0.7)', 'rgba(251,191,36,0.7)', 'rgba(248,113,113,0.7)', 'rgba(129,140,248,0.7)', 'rgba(34,211,238,0.7)'];
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => colors[i % colors.length]), borderColor: '#0f0f1a', borderWidth: 3, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16, font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
        tooltip: { callbacks: { label: (c) => { const t = c.dataset.data.reduce((a, b) => a + b, 0); return ` ${c.label}: ¥${c.raw.toFixed(2)} (${((c.raw / t) * 100).toFixed(1)}%)`; } } }
      },
      animation: { animateScale: true, animateRotate: true, duration: 800 }
    }
  });
}

/** 折线图：每日收支趋势 */
function updateLineChart(dailyData, start, end) {
  const ctx = document.getElementById('line-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  const dates = [], expenseData = [], incomeData = [];
  const s = new Date(start), e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dateStr = fmtDate(d);
    dates.push(`${d.getMonth() + 1}/${d.getDate()}`);
    expenseData.push(dailyData[dateStr]?.expense || 0);
    incomeData.push(dailyData[dateStr]?.income || 0);
  }
  if (lineChart) lineChart.destroy();
  const g2d = ctx.getContext('2d');
  const expenseGradient = g2d.createLinearGradient(0, 0, 0, 280);
  expenseGradient.addColorStop(0, 'rgba(248,113,113,0.25)'); expenseGradient.addColorStop(1, 'rgba(248,113,113,0)');
  const incomeGradient = g2d.createLinearGradient(0, 0, 0, 280);
  incomeGradient.addColorStop(0, 'rgba(52,211,153,0.25)'); incomeGradient.addColorStop(1, 'rgba(52,211,153,0)');
  lineChart = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets: [
      { label: '支出', data: expenseData, borderColor: '#f87171', backgroundColor: expenseGradient, fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#f87171', pointBorderColor: '#0f0f1a', pointBorderWidth: 2, pointHoverRadius: 6 },
      { label: '收入', data: incomeData, borderColor: '#34d399', backgroundColor: incomeGradient, fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#34d399', pointBorderColor: '#0f0f1a', pointBorderWidth: 2, pointHoverRadius: 6 }
    ] },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { labels: { color: '#94a3b8', usePointStyle: true, pointStyleWidth: 8, padding: 20 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ¥${c.raw.toFixed(2)}` } }
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(139,92,246,0.06)' } },
        y: { ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => `¥${v}` }, grid: { color: 'rgba(139,92,246,0.06)' }, beginAtZero: true }
      },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

// ============================================================
// 十八、设置模块（自定义分类）
// ============================================================

/** 判断某小类是否为默认（内置）小类 */
function isDefaultSub(type, parentName, subName) {
  const defaults = type === 'expense' ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
  const parent = defaults.find(p => p.name === parentName);
  return !!(parent && parent.subs.some(s => s.name === subName));
}

/** 渲染设置页分类（两级：按大类分组，显示小类 tags，组内可添加小类） */
async function renderSettingsCategories() {
  userExpenseCategories = normalizeUserCats(await getSetting('userExpenseCategories', []));
  userIncomeCategories = normalizeUserCats(await getSetting('userIncomeCategories', []));
  buildKeywordMaps();
  await loadKeywordMemory();

  renderCatGroup('expense', document.getElementById('expense-categories'));
  renderCatGroup('income', document.getElementById('income-categories'));
}

/** 渲染一个类型的大类分组 */
function renderCatGroup(type, container) {
  if (!container) return;
  const parents = getAllCategories(type);
  container.innerHTML = parents.map(parent => `
    <div class="cat-parent-block">
      <div class="cat-parent-title">${parent.icon} ${escapeHtml(parent.name)}</div>
      <div class="cat-sub-list">
        ${parent.subs.map(sub => `
          <span class="cat-tag ${isDefaultSub(type, parent.name, sub.name) ? 'builtin' : 'custom'}">
            ${escapeHtml(sub.name)}
            ${isDefaultSub(type, parent.name, sub.name) ? '' : `<span class="cat-delete" data-type="${type}" data-parent="${escapeHtml(parent.name)}" data-sub="${escapeHtml(sub.name)}">×</span>`}
          </span>
        `).join('')}
      </div>
      <div class="add-sub-row">
        <input type="text" class="cat-input add-sub-input" data-type="${type}" data-parent="${escapeHtml(parent.name)}" placeholder="在「${escapeHtml(parent.name)}」下加小类">
        <button class="btn-add-cat btn-add-sub" data-type="${type}" data-parent="${escapeHtml(parent.name)}">添加</button>
      </div>
    </div>
  `).join('');

  // 绑定删除小类
  container.querySelectorAll('.cat-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteCategory(btn.dataset.type, btn.dataset.parent, btn.dataset.sub));
  });
  // 绑定添加小类
  container.querySelectorAll('.btn-add-sub').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = container.querySelector(`.add-sub-input[data-parent="${CSS.escape(btn.dataset.parent)}"]`);
      if (input && input.value.trim()) addCategory(btn.dataset.type, btn.dataset.parent, input.value.trim());
    });
  });
  container.querySelectorAll('.add-sub-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) addCategory(input.dataset.type, input.dataset.parent, input.value.trim());
    });
  });
}

/** 在指定大类下添加自定义小类 */
async function addCategory(type, parentName, subName) {
  if (!subName || !subName.trim()) { showToast('请输入小类名称', 'warning'); return; }
  subName = subName.trim();
  const isExpense = type === 'expense';
  const userCats = isExpense ? [...userExpenseCategories] : [...userIncomeCategories];
  const defaults = isExpense ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
  const allParents = getAllCategories(type);

  // 重名检查（全部分类范围内）
  if (allParents.some(p => p.subs.some(s => s.name === subName))) { showToast('小类已存在', 'warning'); return; }
  // 大类必须存在
  const parentInfo = allParents.find(p => p.name === parentName);
  if (!parentInfo) { showToast('大类不存在', 'error'); return; }

  // 写入用户自定义结构：找到/新建该大类条目
  let userParent = userCats.find(p => p.name === parentName);
  if (!userParent) {
    userParent = { name: parentName, icon: parentInfo.icon, subs: [] };
    userCats.push(userParent);
  }
  userParent.subs.push({ name: subName, icon: '📌', keywords: [subName] });

  if (isExpense) { userExpenseCategories = userCats; await setSetting('userExpenseCategories', userCats); }
  else { userIncomeCategories = userCats; await setSetting('userIncomeCategories', userCats); }
  buildKeywordMaps();
  renderSettingsCategories();
  showToast(`已在「${parentName}」添加：${subName}`, 'success');
}

/** 删除自定义小类（默认小类不可删） */
async function deleteCategory(type, parentName, subName) {
  const isExpense = type === 'expense';
  if (isDefaultSub(type, parentName, subName)) { showToast('默认小类不可删除', 'warning'); return; }
  const confirmed = await showConfirm(`确定删除小类「${subName}」吗？`);
  if (!confirmed) return;

  let userCats = isExpense ? [...userExpenseCategories] : [...userIncomeCategories];
  const userParent = userCats.find(p => p.name === parentName);
  if (userParent) {
    userParent.subs = userParent.subs.filter(s => s.name !== subName);
    // 大类下无小类则移除该大类条目
    if (userParent.subs.length === 0) userCats = userCats.filter(p => p.name !== parentName);
  }
  if (isExpense) { userExpenseCategories = userCats; await setSetting('userExpenseCategories', userCats); }
  else { userIncomeCategories = userCats; await setSetting('userIncomeCategories', userCats); }
  buildKeywordMaps();
  renderSettingsCategories();
  showToast(`已删除：${subName}`, 'success');
}

// ============================================================
// 十九、数据导入导出
// ============================================================

async function exportData() {
  try {
    const bills = await getBills();
    const settings = {};
    for (const key of ['userExpenseCategories', 'userIncomeCategories']) settings[key] = await getSetting(key, []);
    const exportObj = { version: 1, exportDate: new Date().toISOString(), bills, settings };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `账单备份_${todayStr()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('数据导出成功', 'success');
  } catch (err) { console.error('[导出] 失败:', err); showToast('导出失败', 'error'); }
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.bills || !Array.isArray(data.bills)) { showToast('无效的备份文件', 'error'); return; }
    const confirmed = await showConfirm(`即将导入 ${data.bills.length} 条记录（不覆盖现有数据），继续吗？`);
    if (!confirmed) return;
    for (const bill of data.bills) { const { id, createdAt, ...billData } = bill; await addBill(billData); }
    if (data.settings) for (const [key, value] of Object.entries(data.settings)) await setSetting(key, value);
    userExpenseCategories = await getSetting('userExpenseCategories', []);
    userIncomeCategories = await getSetting('userIncomeCategories', []);
    buildKeywordMaps();
    await loadKeywordMemory();
    showToast(`成功导入 ${data.bills.length} 条`, 'success');
    refreshHomeSummary();
    if (currentPage === 'list') renderBillList();
    if (currentPage === 'settings') renderSettingsCategories();
  } catch (err) { console.error('[导入] 失败:', err); showToast('导入失败，请检查文件', 'error'); }
}

// ============================================================
// 二十、网络状态检测
// ============================================================

async function isMicrophoneAllowed() {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({ name: 'microphone' });
      if (result.state === 'denied') return false;
    }
    return !!navigator.mediaDevices;
  } catch (e) { return false; }
}

async function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  const speechSupported = isSpeechSupported();
  const voiceBtn = document.getElementById('voice-btn');
  const voiceHint = document.getElementById('voice-hint');
  const offlineBanner = document.getElementById('offline-banner');
  const setBanner = (icon, text) => {
    if (offlineBanner) {
      offlineBanner.style.display = 'flex';
      offlineBanner.querySelector('.offline-icon').textContent = icon;
      offlineBanner.querySelector('span:last-child').textContent = text;
    }
  };

  if (!speechSupported) {
    setBanner('🔇', '当前浏览器不支持语音识别，请使用手动输入');
    if (voiceBtn) voiceBtn.style.display = 'none';
    if (voiceHint) voiceHint.textContent = '当前浏览器不支持语音，请手动输入';
    return;
  }
  if (!isOnline) {
    setBanner('📡', '离线中，暂不支持语音识别');
    if (voiceBtn) voiceBtn.style.display = 'none';
    if (voiceHint) voiceHint.textContent = '离线模式下请手动输入账单';
    return;
  }
  const micAllowed = await isMicrophoneAllowed();
  if (!micAllowed) {
    setBanner('🎤', '当前环境不支持麦克风，请使用手动输入');
    if (voiceBtn) voiceBtn.style.display = 'none';
    if (voiceHint) voiceHint.textContent = '麦克风不可用，请手动输入';
    return;
  }
  if (offlineBanner) offlineBanner.style.display = 'none';
  if (voiceBtn) voiceBtn.style.display = '';
  resetVoiceHint();
}

// ============================================================
// 二十一、应用初始化
// ============================================================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('[SW] 注册成功:', reg.scope))
        .catch((err) => console.warn('[SW] 注册失败:', err));
    });
  }
}

/** 绑定所有事件监听器 */
function bindEvents() {
  // ---- 底部导航 ----
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.page)));

  // ---- 语音按钮：按住说话（触摸 + 指针） ----
  const voiceBtn = document.getElementById('voice-btn');
  if (voiceBtn) {
    voiceBtn.style.touchAction = 'none'; // 阻止触摸滚动干扰
    // 指针事件（覆盖触摸/鼠标/触控笔）
    voiceBtn.addEventListener('pointerdown', onVoicePressStart);
    window.addEventListener('pointermove', onVoicePressMove, { passive: true });
    window.addEventListener('pointerup', onVoicePressEnd);
    window.addEventListener('pointercancel', onVoicePressCancel);
    // 触摸事件兜底（部分安卓 WebView pointer 支持不全）
    voiceBtn.addEventListener('touchstart', (e) => { if (!window.PointerEvent) onVoicePressStart(e); }, { passive: false });
    voiceBtn.addEventListener('touchmove', (e) => { if (!window.PointerEvent) onVoicePressMove(e); }, { passive: true });
    voiceBtn.addEventListener('touchend', () => { if (!window.PointerEvent) onVoicePressEnd(); });
    voiceBtn.addEventListener('touchcancel', () => { if (!window.PointerEvent) onVoicePressCancel(); });
    // 阻止按钮 click 默认（避免与 pointer 交互冲突）
    voiceBtn.addEventListener('click', (e) => e.preventDefault());
    voiceBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- 语音胶囊事件 ----
  document.getElementById('capsule-close')?.addEventListener('click', closeVoiceCapsule);
  document.getElementById('capsule-confirm')?.addEventListener('click', confirmVoiceCapsule);

  // 金额点击就地编辑
  const amountWrap = document.getElementById('capsule-amount-wrap');
  const amountInput = document.getElementById('capsule-amount-input');
  amountWrap?.addEventListener('click', () => { if (amountInput.style.display === 'none') showAmountInput(); });
  amountInput?.addEventListener('blur', () => hideAmountInput(true));
  amountInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hideAmountInput(true); } });

  // 分类点击 / 左右滑动切换
  const catField = document.getElementById('capsule-category-field');
  let catTouchX = 0, catMoved = false;
  catField?.addEventListener('touchstart', (e) => { catTouchX = e.touches[0].clientX; catMoved = false; }, { passive: true });
  catField?.addEventListener('touchmove', (e) => { if (Math.abs(e.touches[0].clientX - catTouchX) > 10) catMoved = true; }, { passive: true });
  catField?.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - catTouchX;
    if (Math.abs(dx) > 30) { e.preventDefault(); cycleCapsuleCategory(dx < 0 ? 1 : -1); catMoved = true; }
  });
  catField?.addEventListener('click', () => { if (!catMoved) toggleCapsuleCatPanel(); catMoved = false; });

  // 日期点击弹日期选择器
  const dateField = document.getElementById('capsule-date-field');
  const dateInput = document.getElementById('capsule-date-input');
  dateField?.addEventListener('click', () => {
    try { dateInput.showPicker(); } catch (e) { dateInput.focus(); dateInput.click(); }
  });
  dateInput?.addEventListener('change', () => {
    if (dateInput.value) {
      capsuleData.date = dateInput.value;
      document.getElementById('capsule-date').textContent = formatDateLabel(dateInput.value);
    }
  });

  // 备注点击就地编辑
  const noteWrap = document.getElementById('capsule-note-wrap');
  const noteInput = document.getElementById('capsule-note-input');
  noteWrap?.addEventListener('click', () => { if (noteInput.style.display === 'none') showNoteInput(); });
  noteInput?.addEventListener('blur', hideNoteInput);
  noteInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hideNoteInput(); } });

  // ---- 快速撤销 ----
  document.getElementById('undo-bar')?.addEventListener('click', handleUndo);

  // ---- 手动输入发送 ----
  const btnSend = document.getElementById('btn-send');
  const manualInput = document.getElementById('manual-input');
  const handleManualInput = () => {
    const text = manualInput.value.trim();
    if (!text) return;
    const parsed = parseBillText(text);
    manualInput.value = '';
    if (!parsed) { showToast('无法识别账单信息，请完善', 'warning'); return; }
    if (parsed.amount !== null && parsed.category !== null) {
      // 信息完整 → 直接保存 + 撤销条（含大类）
      addBill({ type: parsed.type, amount: parsed.amount, category: parsed.category, parentCategory: parsed.parentCategory, categoryIcon: parsed.categoryIcon || (parsed.type === 'income' ? '💰' : '💸'), date: parsed.date, note: parsed.note })
        .then((id) => { showUndoBar(id, `已记录 ${shortDatePrefix(parsed.date)}${parsed.category} ¥${parsed.amount.toFixed(2)}`); refreshHomeSummary(); });
    } else if (parsed.amount !== null) {
      // 有金额但分类缺失 → 语音胶囊补全
      openVoiceCapsule(parsed);
    } else {
      // 金额缺失 → 完整模态表单
      openEditModal(parsed);
    }
  };
  btnSend?.addEventListener('click', handleManualInput);
  manualInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleManualInput(); } });

  // ---- 快速记账按钮 ----
  document.querySelectorAll('.quick-btn').forEach(btn => btn.addEventListener('click', () => {
    manualInput.value = btn.dataset.text;
    handleManualInput();
  }));

  // ---- 账单列表筛选 ----
  document.querySelectorAll('#page-list .filter-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('#page-list .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    const customRange = document.getElementById('custom-range');
    if (currentFilter === 'custom') customRange.style.display = 'flex';
    else { customRange.style.display = 'none'; renderBillList(); }
  }));

  document.getElementById('btn-apply-range')?.addEventListener('click', () => {
    customDateStart = document.getElementById('date-start').value;
    customDateEnd = document.getElementById('date-end').value;
    if (customDateStart && customDateEnd) renderBillList();
    else showToast('请选择起止日期', 'warning');
  });
  const dateStart = document.getElementById('date-start');
  const dateEnd = document.getElementById('date-end');
  if (dateStart) dateStart.value = todayStr();
  if (dateEnd) dateEnd.value = todayStr();

  // ---- 多选模式按钮 ----
  document.getElementById('btn-cancel-multi')?.addEventListener('click', exitMultiSelect);
  document.getElementById('btn-batch-delete')?.addEventListener('click', batchDeleteSelected);

  // ---- 下拉刷新 ----
  let pullStartY = 0;
  const billList = document.getElementById('bill-list');
  const pullIndicator = document.getElementById('pull-indicator');
  const pageList = document.getElementById('page-list');
  if (billList && pullIndicator && pageList) {
    pageList.addEventListener('touchstart', (e) => { if (billList.scrollTop <= 0) pullStartY = e.touches[0].clientY; }, { passive: true });
    pageList.addEventListener('touchmove', (e) => { if (billList.scrollTop <= 0 && e.touches[0].clientY - pullStartY > 40) pullIndicator.classList.add('pulling'); }, { passive: true });
    pageList.addEventListener('touchend', async () => {
      if (pullIndicator.classList.contains('pulling')) {
        pullIndicator.classList.add('refreshing');
        pullIndicator.querySelector('span:last-child').textContent = '刷新中...';
        await renderBillList();
        pullIndicator.classList.remove('pulling', 'refreshing');
        pullIndicator.querySelector('span:last-child').textContent = '下拉刷新';
      }
    });
  }

  // ---- 统计筛选 ----
  document.querySelectorAll('#page-stats .filter-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('#page-stats .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    statsFilter = btn.dataset.statsFilter;
    refreshStats();
  }));

  // ---- 统计：饼图 大类/细分 切换 ----
  document.querySelectorAll('.groupby-tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.groupby-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    statsGroupBy = btn.dataset.groupby;
    refreshStats();
  }));

  // ---- 首页标题自定义编辑 ----
  bindAppTitleEdit();

  // ---- 模态框事件 ----
  document.getElementById('modal-close')?.addEventListener('click', closeEditModal);
  document.getElementById('btn-cancel')?.addEventListener('click', closeEditModal);
  document.getElementById('btn-confirm')?.addEventListener('click', confirmSaveBill);
  document.getElementById('btn-delete-bill')?.addEventListener('click', deleteCurrentEditingBill);
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeEditModal(); });
  document.getElementById('type-expense-btn')?.addEventListener('click', () => setModalType('expense'));
  document.getElementById('type-income-btn')?.addEventListener('click', () => setModalType('income'));

  // ---- 设置：分类添加/删除 已在 renderCatGroup 内部动态绑定，此处无需静态绑定 ----

  // ---- 设置：数据管理 ----
  document.getElementById('btn-export')?.addEventListener('click', exportData);
  document.getElementById('btn-import')?.addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file')?.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; });
  document.getElementById('btn-clear-data')?.addEventListener('click', async () => {
    const confirmed = await showConfirm('确定清除所有账单数据吗？不可撤销！');
    if (confirmed) { await clearAllBills(); showToast('所有数据已清除', 'success'); refreshHomeSummary(); if (currentPage === 'list') renderBillList(); if (currentPage === 'stats') refreshStats(); }
  });

  // ---- 网络状态监听 ----
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

/** 应用入口 */
async function initApp() {
  try { await openDB(); console.log('[App] IndexedDB 就绪'); }
  catch (err) { console.error('[App] IndexedDB 失败:', err); }

  // 清理过期回收站（7 天）
  try { await cleanExpiredTrash(); } catch (e) {}

  // 加载用户设置与分类记忆（规范化为两级结构，兼容旧数据）
  userExpenseCategories = normalizeUserCats(await getSetting('userExpenseCategories', []));
  userIncomeCategories = normalizeUserCats(await getSetting('userIncomeCategories', []));
  buildKeywordMaps();
  await loadKeywordMemory();

  // 加载自定义应用标题
  loadAppTitle();

  registerServiceWorker();
  updateOnlineStatus();
  bindEvents();
  refreshHomeSummary();
  console.log('[App] 极简语音记账已就绪');
}

// 启动应用
document.addEventListener('DOMContentLoaded', initApp);
