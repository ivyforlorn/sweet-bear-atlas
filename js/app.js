/* ============================================================
   松松熊甜品地图 · Sweet Bear Atlas
   ============================================================ */

'use strict';

/* ----------------------------- 基础索引 ----------------------------- */

const cityIndex = Object.fromEntries(CITIES.map((city) => [city.id, city]));
const categoryIndex = Object.fromEntries(CATEGORIES.map((cat) => [cat.id, cat]));

const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (err) { /* 无痕模式也可以继续逛 */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
  },
};

function readFavorites() {
  try {
    const parsed = JSON.parse(store.get('sweetbear.favs') || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    return new Set();
  }
}

function decorateShop(shop) {
  const city = cityIndex[shop.city] || {};
  const category = categoryIndex[shop.category] || { label: '甜点', emoji: '🍰' };
  return {
    ...shop,
    notes: Array.isArray(shop.notes) ? shop.notes : [],
    tags: Array.isArray(shop.tags) ? shop.tags : [],
    cityName: city.name || '',
    cityEn: city.en || '',
    country: city.country || '',
    cityRegion: city.region || '',
    categoryLabel: category.label,
    categoryEmoji: category.emoji,
  };
}

const curatedShops = SHOPS.map(decorateShop);

const state = {
  query: '',
  region: 'all',
  category: 'all',
  minRating: 0,
  favoritesOnly: false,
  activeCity: null,
  sort: 'rating',
  favorites: readFavorites(),
  googleKey: store.get('sweetbear.googleKey') || '',
  liveShops: {},           // cityId -> google shops
  addMode: false,
  pendingLocation: null,   // { lat, lng, cityId }
};

let shopList = [...curatedShops];
let shopsById = new Map(shopList.map((shop) => [shop.id, shop]));
let fuseShops = null;
let fuseCities = null;

let map = null;
let clusterGroup = null;
let shopLayer = null;
const cityMarkers = new Map();
const shopMarkers = new Map();
let currentModalShopId = null;
let lastFocusedElement = null;
let suggestActiveIndex = -1;
let searchFlyTimer = null;
let toastTimer = null;
let toastHideTimer = null;

/* ----------------------------- DOM ----------------------------- */

const el = {
  body: document.body,
  brandHome: document.getElementById('brandHome'),
  favoritesToggle: document.getElementById('favoritesToggle'),
  favCount: document.getElementById('favCount'),
  settingsBtn: document.getElementById('settingsBtn'),
  liveDot: document.getElementById('liveDot'),
  searchInput: document.getElementById('searchInput'),
  searchClear: document.getElementById('searchClear'),
  suggestions: document.getElementById('suggestions'),
  regionChips: document.getElementById('regionChips'),
  ratingChips: document.getElementById('ratingChips'),
  categoryChips: document.getElementById('categoryChips'),
  sortSelect: document.getElementById('sortSelect'),
  results: document.getElementById('results'),
  resultsTitle: document.getElementById('resultsTitle'),
  resultsSub: document.getElementById('resultsSub'),
  noteSettings: document.getElementById('noteSettings'),
  mapTip: document.getElementById('mapTip'),
  cityBanner: document.getElementById('cityBanner'),
  cityBannerName: document.getElementById('cityBannerName'),
  cityBannerEn: document.getElementById('cityBannerEn'),
  cityBannerSub: document.getElementById('cityBannerSub'),
  googleFetchBtn: document.getElementById('googleFetchBtn'),
  googleFetchLabel: document.getElementById('googleFetchLabel'),
  exitCityBtn: document.getElementById('exitCityBtn'),
  randomBtn: document.getElementById('randomBtn'),
  mapFavBtn: document.getElementById('mapFavBtn'),
  mapFavCount: document.getElementById('mapFavCount'),
  addShopBtn: document.getElementById('addShopBtn'),
  addHint: document.getElementById('addHint'),
  cancelAddBtn: document.getElementById('cancelAddBtn'),
  addShopModal: document.getElementById('addShopModal'),
  addShopForm: document.getElementById('addShopForm'),
  addShopLoc: document.getElementById('addShopLoc'),
  myShopName: document.getElementById('myShopName'),
  myShopCategory: document.getElementById('myShopCategory'),
  myShopRating: document.getElementById('myShopRating'),
  myShopSignature: document.getElementById('myShopSignature'),
  myShopAddress: document.getElementById('myShopAddress'),
  myShopCollect: document.getElementById('myShopCollect'),
  addShopError: document.getElementById('addShopError'),
  shopModal: document.getElementById('shopModal'),
  shopModalBody: document.getElementById('shopModalBody'),
  settingsModal: document.getElementById('settingsModal'),
  googleKeyInput: document.getElementById('googleKeyInput'),
  keyEye: document.getElementById('keyEye'),
  saveKeyBtn: document.getElementById('saveKeyBtn'),
  testKeyBtn: document.getElementById('testKeyBtn'),
  clearKeyBtn: document.getElementById('clearKeyBtn'),
  keyStatus: document.getElementById('keyStatus'),
  toast: document.getElementById('toast'),
};

/* ----------------------------- SVG 小插图 ----------------------------- */

const DESSERT_ART = {
  cake: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="55" rx="20" ry="3.4" fill="#E9D8BD" opacity=".65"/>
    <path d="M15 36 32 27l17 9v13c0 3-2.4 5-5.4 5H20.4C17.4 54 15 52 15 49Z" fill="#FCF2E1" stroke="#8A6547" stroke-width="2" stroke-linejoin="round"/>
    <path d="M15 39c4-2.8 8 2.2 12-.6s8 2.2 12-.6 8 2.2 12-.6v11.4c0 3-2.4 5-5.4 5H20.4C17.4 54 15 52 15 49Z" fill="#F8DAD3" stroke="#8A6547" stroke-width="2" stroke-linejoin="round"/>
    <path d="M15 36 32 27l17 9" fill="#FFF9EE" stroke="#8A6547" stroke-width="2" stroke-linejoin="round"/>
    <path d="M32 20c-1-4 2-6 4-7" fill="none" stroke="#8A6547" stroke-width="2" stroke-linecap="round"/>
    <circle cx="33" cy="22" r="5" fill="#ECA9A5" stroke="#8A6547" stroke-width="2"/>
    <path d="M30 17q3-1 5 1" fill="none" stroke="#8CB07A" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  bakery: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="52" rx="21" ry="3" fill="#E9D8BD" opacity=".6"/>
    <path d="M9 41c0-12 10-21 23-21s23 9 23 21c0 4-4 6-8 3l-9-7c-3.5-2.5-8.5-2.5-12 0l-9 7c-4 3-8 1-8-3Z" fill="#F2CB86" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M18 24c3 4 4 9 4 15M46 24c-3 4-4 9-4 15M28 20c1 5 1 11 0 18M36 20c-1 5-1 11 0 18" fill="none" stroke="#D6A45F" stroke-width="2" stroke-linecap="round"/>
    <path d="M14 34c5-6 12-9 18-9" fill="none" stroke="#FBE6BE" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
  </svg>`,
  gelato: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="57" rx="14" ry="2.6" fill="#E9D8BD" opacity=".6"/>
    <path d="M24 34h16l-7 20c-.4 1.2-1.6 1.2-2 0Z" fill="#EFC084" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M27 38h10M28 43h8M29 48h6" fill="none" stroke="#D7A363" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="24" cy="26" r="10" fill="#F4D3D0" stroke="#8A6547" stroke-width="2.2"/>
    <circle cx="39" cy="25" r="10" fill="#FBF1DC" stroke="#8A6547" stroke-width="2.2"/>
    <circle cx="32" cy="17" r="8.5" fill="#E5EDD3" stroke="#8A6547" stroke-width="2.2"/>
    <circle cx="32" cy="8" r="3" fill="#EBA6A2" stroke="#8A6547" stroke-width="1.8"/>
    <path d="M32 5q1-3 4-3" fill="none" stroke="#8A6547" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
  matcha: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="52" rx="19" ry="4" fill="#E9D8BD" opacity=".6"/>
    <path d="M13 32h38c0 11-8 19-19 19S13 43 13 32Z" fill="#FBF5E7" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
    <ellipse cx="32" cy="32" rx="19" ry="6.5" fill="#BFD49B" stroke="#8A6547" stroke-width="2.2"/>
    <path d="M23 29c3-5 15-5 18 0" fill="none" stroke="#FBF8ED" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="30" cy="27" r="1.8" fill="#78935C"/>
    <ellipse cx="39" cy="33" rx="4" ry="2" fill="#A9C487"/>
    <path d="M45 24c3-2 5-1 6 1-2 2-4 2-6-1Z" fill="#9DBB7D" stroke="#8A6547" stroke-width="1.4"/>
  </svg>`,
  pudding: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="55" rx="19" ry="3.4" fill="#E9D8BD" opacity=".65"/>
    <path d="M20 36c0-8 5-14 12-14s12 6 12 14l-2.5 13h-19Z" fill="#F5D382" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M20 35c2 3 4-1 6 1s4-1 6 1 4-1 6 1 4-1 6-2l-.5 4c-4 3-19 3-23-1Z" fill="#D8A15C" stroke="#8A6547" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="32" cy="52" rx="14" ry="4" fill="#FDF4E2" stroke="#8A6547" stroke-width="1.8"/>
    <path d="M24 28c2-4 5-6 8-6s6 2 8 6" fill="none" stroke="#FDF4E2" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="30" cy="21" r="2.2" fill="#FBF1DC" stroke="#8A6547" stroke-width="1.4"/>
  </svg>`,
  tart: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="55" rx="20" ry="3.2" fill="#E9D8BD" opacity=".6"/>
    <path d="M16 34c0-2 2-4 4-4h24c2 0 4 2 4 4l-3 15c-1 3-3 4-6 4H25c-3 0-5-1-6-4Z" fill="#EFC98F" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M16 34h32" fill="none" stroke="#8A6547" stroke-width="2"/>
    <circle cx="19" cy="34" r="2.4" fill="#F7D9A4" stroke="#8A6547" stroke-width="1.4"/>
    <circle cx="27" cy="34" r="2.4" fill="#F7D9A4" stroke="#8A6547" stroke-width="1.4"/>
    <circle cx="35" cy="34" r="2.4" fill="#F7D9A4" stroke="#8A6547" stroke-width="1.4"/>
    <circle cx="43" cy="34" r="2.4" fill="#F7D9A4" stroke="#8A6547" stroke-width="1.4"/>
    <path d="M22 34c0-4 4-8 10-8s10 4 10 8c0 4-4 6-10 6s-10-2-10-6Z" fill="#FFF9EC" stroke="#8A6547" stroke-width="2"/>
    <circle cx="28" cy="26" r="4.5" fill="#ECAAA6" stroke="#8A6547" stroke-width="1.8"/>
    <circle cx="39" cy="25" r="4" fill="#D8A7C4" stroke="#8A6547" stroke-width="1.8"/>
    <path d="M34 21q2-3 4-3M45 21q2-2 4-2" fill="none" stroke="#8CB07A" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
  chocolate: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="55" rx="17" ry="3" fill="#E9D8BD" opacity=".6"/>
    <rect x="21" y="14" width="22" height="38" rx="4" fill="#A97751" stroke="#8A6547" stroke-width="2.2"/>
    <path d="M21 26h22M21 38h22M32 14v38" fill="none" stroke="#8A6547" stroke-width="1.6" opacity=".55"/>
    <path d="M23 18c3 2 5 1 7 3" fill="none" stroke="#C79A72" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 44c3-2 7-2 10 0M42 46c3-2 6-2 9 0" fill="none" stroke="#D8B894" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
  </svg>`,
  shaved: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="55" rx="19" ry="3" fill="#E9D8BD" opacity=".6"/>
    <path d="M13 37h38c-1 10-8 16-19 16S14 47 13 37Z" fill="#E7F0F2" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M18 35c2-9 7-14 14-14s12 5 14 14" fill="#FDFCF8" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M25 24c1-4 4-6 7-6s6 2 7 6" fill="#F8FBF8" stroke="#8A6547" stroke-width="1.8" stroke-linejoin="round"/>
    <ellipse cx="32" cy="36" rx="19" ry="5" fill="#FFFDFA" stroke="#8A6547" stroke-width="2"/>
    <circle cx="26" cy="31" r="3" fill="#ECA9A5" stroke="#8A6547" stroke-width="1.6"/>
    <circle cx="38" cy="33" r="2.6" fill="#ECAAA6" stroke="#8A6547" stroke-width="1.5"/>
    <path d="M33 28q2-2 5 0" fill="none" stroke="#8CB07A" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
  fruit: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="56" rx="14" ry="2.8" fill="#E9D8BD" opacity=".6"/>
    <path d="M23 18h18l-2 27c-.2 2-1.6 3-3.6 3h-6.8c-2 0-3.4-1-3.6-3Z" fill="#FBF4E5" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round" opacity=".92"/>
    <path d="M25 30h14M24.6 38h14.8" fill="none" stroke="#8A6547" stroke-width="1.4" opacity=".4"/>
    <path d="M25 39h14l-.6 6c-.2 2-1.6 3-3.4 3h-6c-1.8 0-3.2-1-3.4-3Z" fill="#F0C05F"/>
    <path d="M24.5 30h15l-.5 8h-14Z" fill="#FBF3DC"/>
    <path d="M25 22h14l-.3 8h-13.4Z" fill="#F2D6CF"/>
    <path d="M27 33c3-2 7-2 10 0M27 40.5c3-1.6 7-1.6 10 0" fill="none" stroke="#D9B06B" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="32" cy="16" r="3.4" fill="#ECA9A5" stroke="#8A6547" stroke-width="1.6"/>
    <path d="M32 13q1-3 4-3" fill="none" stroke="#8A6547" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
  macaron: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="54" rx="17" ry="3" fill="#E9D8BD" opacity=".6"/>
    <g transform="rotate(-5 32 36)">
      <path d="M15 33c0-8 7-13 17-13s17 5 17 13Z" fill="#F3CCD0" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M15 33h34v4c0 2.5-2 4.5-4.5 4.5h-25C17 41.5 15 39.5 15 37Z" fill="#F8EAD5" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M15 42c0 5 7 8 17 8s17-3 17-8v-4.5H15Z" fill="#F3CCD0" stroke="#8A6547" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M24 24c2 3 2 5 3 7M33 21c1 3 1 6 1 9" fill="none" stroke="#F9E3E5" stroke-width="2" stroke-linecap="round"/>
    </g>
    <circle cx="18" cy="52" r="1.6" fill="#E8CED0"/>
    <circle cx="45" cy="51" r="1.2" fill="#E8CED0"/>
  </svg>`,
};

function dessertArt(category) {
  return DESSERT_ART[category] || DESSERT_ART.cake;
}

const AVATAR_IMG = {
  brown: 'assets/brown-face.png',
  white: 'assets/white-face.png',
  chick: 'assets/chick.png',
};

function avatarSVG(kind) {
  const src = AVATAR_IMG[kind] || AVATAR_IMG.brown;
  return `<img src="${src}" alt="" class="avatar-img" />`;
}

const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.3a5.2 5.2 0 0 1 9.3 5.1c-1.8 4.4-9.3 9-9.3 9Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

const PAW_HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.4" cy="8.4" r="1.65" fill="currentColor"/><circle cx="10.1" cy="5.9" r="1.65" fill="currentColor"/><circle cx="13.9" cy="5.9" r="1.65" fill="currentColor"/><circle cx="17.6" cy="8.4" r="1.65" fill="currentColor"/><path d="M12 20.6c-3.1-2.2-4.9-4.1-4.9-6.3 0-1.5 1.1-2.7 2.6-2.7.9 0 1.7.5 2.3 1.4.6-.9 1.4-1.4 2.3-1.4 1.5 0 2.6 1.2 2.6 2.7 0 2.2-1.8 4.1-4.9 6.3Z" fill="currentColor"/></svg>`;

/* ----------------------------- 我添加的小店 ----------------------------- */

const MY_SHOPS_KEY = 'sweetbear.myShops';

function readMyShopsRaw() {
  try {
    const parsed = JSON.parse(store.get(MY_SHOPS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((shop) => (
      shop
      && typeof shop.name === 'string'
      && typeof shop.lat === 'number'
      && typeof shop.lng === 'number'
      && cityIndex[shop.city]
    ));
  } catch (err) {
    return [];
  }
}

function decorateMyShop(shop) {
  const merged = {
    nameEn: '',
    rating: 0,
    reviewCount: 0,
    signature: '',
    address: '',
    hours: '',
    price: '',
    ...shop,
    tags: Array.isArray(shop.tags) && shop.tags.length ? shop.tags : ['我的小店'],
    notes: Array.isArray(shop.notes) ? shop.notes : [],
    category: categoryIndex[shop.category] ? shop.category : 'cake',
    rating: Number.isFinite(shop.rating) ? shop.rating : 0,
    source: 'custom',
  };
  return decorateShop(merged);
}

function persistMyShops(list) {
  store.set(MY_SHOPS_KEY, JSON.stringify(list));
}

function addMyShop(shop) {
  const list = readMyShopsRaw();
  list.push(shop);
  persistMyShops(list);
  rebuildSearchIndex();
  if (map) buildCityMarkers();
}

function removeMyShop(shopId) {
  persistMyShops(readMyShopsRaw().filter((shop) => shop.id !== shopId));
  state.favorites.delete(shopId);
  persistFavorites();
  rebuildSearchIndex();
  if (map) buildCityMarkers();
}

/* ----------------------------- 工具函数 ----------------------------- */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function starsHTML(rating) {
  const num = Number(rating) || 0;
  const pct = Math.max(0, Math.min(100, (num / 5) * 100));
  return `<span class="stars" style="--pct:${pct.toFixed(1)}%" aria-label="${num.toFixed(1)} 星">★★★★★</span>`;
}

function scoreText(rating) {
  return rating ? Number(rating).toFixed(1) : '—';
}

function formatCount(num) {
  const n = Number(num) || 0;
  if (n >= 10000) {
    const value = n / 10000;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}万`;
  }
  return n.toLocaleString('zh-CN');
}

function priceText(price) {
  return price && price !== '未标注' ? price : '';
}

function safeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
}

function googleMapsUrl(shop) {
  return safeUrl(shop.googleMapsUri)
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name} ${shop.address || shop.cityName}`)}`;
}

function showToast(message, type = 'info', duration = 2800) {
  if (!el.toast) return;
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  el.toast.textContent = message;
  el.toast.classList.toggle('is-error', type === 'error');
  el.toast.hidden = false;
  requestAnimationFrame(() => el.toast.classList.add('is-visible'));
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => { el.toast.hidden = true; }, 280);
  }, duration);
}

/* ----------------------------- 搜索索引 ----------------------------- */

function allLiveShops() {
  return Object.values(state.liveShops).flat();
}

function getAllShops() {
  return shopList;
}

function getCityShops(cityId) {
  return shopList
    .filter((shop) => shop.city === cityId)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
}

function isCuratedTwin(shop) {
  const normalize = (name) => String(name || '').toLowerCase().replace(/[\s·・,.'’"()（）\-]/g, '');
  const name = normalize(shop.name);
  return curatedShops.some((cur) => {
    if (cur.city !== shop.city) return false;
    if (name && normalize(cur.name) === name) return true;
    return typeof cur.lat === 'number' && typeof cur.lng === 'number'
      && Math.abs(cur.lat - shop.lat) < 0.0006
      && Math.abs(cur.lng - shop.lng) < 0.0006;
  });
}

function rebuildSearchIndex() {
  const myShops = readMyShopsRaw().map(decorateMyShop);
  shopList = [...curatedShops, ...myShops, ...allLiveShops()];
  shopsById = new Map(shopList.map((shop) => [shop.id, shop]));

  if (typeof Fuse === 'undefined') {
    fuseShops = null;
    fuseCities = null;
    return;
  }

  fuseShops = new Fuse(shopList, {
    includeScore: true,
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: 'name', weight: 0.5 },
      { name: 'nameEn', weight: 0.3 },
      { name: 'cityName', weight: 0.16 },
      { name: 'cityEn', weight: 0.12 },
      { name: 'country', weight: 0.08 },
      { name: 'categoryLabel', weight: 0.14 },
      { name: 'signature', weight: 0.14 },
      { name: 'tags', weight: 0.12 },
    ],
  });

  fuseCities = new Fuse(CITIES, {
    includeScore: true,
    threshold: 0.36,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: 'name', weight: 0.5 },
      { name: 'en', weight: 0.35 },
      { name: 'country', weight: 0.12 },
      { name: 'tagline', weight: 0.08 },
    ],
  });
}

function searchShops(query) {
  const q = query.trim();
  if (!q) return [];
  if (fuseShops) {
    return fuseShops.search(q).map((result) => result.item);
  }
  const needle = q.toLowerCase();
  return shopList.filter((shop) => (
    [shop.name, shop.nameEn, shop.cityName, shop.cityEn, shop.country, shop.categoryLabel, shop.signature, ...(shop.tags || [])]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  ));
}

function searchCities(query) {
  const q = query.trim();
  if (!q) return [];
  if (fuseCities) {
    return fuseCities.search(q).map((result) => result.item);
  }
  const needle = q.toLowerCase();
  return CITIES.filter((city) => (
    [city.name, city.en, city.country, city.tagline].join(' ').toLowerCase().includes(needle)
  ));
}

/* ----------------------------- 结果渲染 ----------------------------- */

function getResults() {
  const query = state.query.trim();
  let list;

  if (query) {
    list = searchShops(query);
  } else {
    list = [...shopList];
  }

  if (!query && state.activeCity && !state.favoritesOnly) {
    list = list.filter((shop) => shop.city === state.activeCity);
  }
  if (state.favoritesOnly) {
    list = list.filter((shop) => state.favorites.has(shop.id));
  }
  if (state.region !== 'all') {
    list = list.filter((shop) => shop.cityRegion === state.region);
  }
  if (state.category !== 'all') {
    list = list.filter((shop) => shop.category === state.category);
  }
  if (state.minRating > 0) {
    list = list.filter((shop) => (shop.rating || 0) >= state.minRating);
  }

  const sorters = {
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewCount || 0) - (a.reviewCount || 0),
    popular: (a, b) => (b.reviewCount || 0) - (a.reviewCount || 0) || (b.rating || 0) - (a.rating || 0),
    name: (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'),
  };
  list.sort(sorters[state.sort] || sorters.rating);

  return list;
}

function cardHTML(shop) {
  const isFav = state.favorites.has(shop.id);
  const isMine = shop.source === 'custom';
  const city = cityIndex[shop.city] || {};
  const price = priceText(shop.price);
  const liveBadge = shop.source === 'google' ? `<span class="source-badge">LIVE</span>` : '';
  const mineBadge = isMine ? `<span class="my-shop-chip">${PAW_HEART_SVG}我的小店</span>` : '';

  return `
    <article class="shop-card cat-${esc(shop.category)} ${isMine ? 'is-mine' : ''}" data-shop="${esc(shop.id)}" tabindex="0" role="button" aria-label="查看 ${esc(shop.name)} 的详情">
      <div class="shop-thumb" aria-hidden="true">${dessertArt(shop.category)}</div>
      <div class="shop-card-body">
        <div class="shop-name-row">
          <h3 class="shop-name">${esc(shop.name)}</h3>
          ${liveBadge}${mineBadge}
        </div>
        <p class="shop-meta">
          <span>${esc(city.name || shop.cityName)}</span><i class="dot"></i>
          <span>${esc(shop.categoryLabel)}</span>
          ${price ? `<i class="dot"></i><span class="price-tag">${esc(price)}</span>` : ''}
        </p>
        <div class="shop-rating-row">
          ${starsHTML(shop.rating)}
          <span class="rating-number">${scoreText(shop.rating)}</span>
          <span class="rating-count">${shop.reviewCount ? `${formatCount(shop.reviewCount)} 条` : '暂无评分'}</span>
        </div>
        <p class="shop-note"><span>招牌 · </span>${esc(shop.signature || '今日甜点')}</p>
      </div>
      <button class="fav-btn ${isFav ? 'is-fav' : ''}" type="button" data-toggle-fav="${esc(shop.id)}" aria-pressed="${isFav}" aria-label="${isFav ? '取消收藏' : '收藏'}${esc(shop.name)}">
        ${HEART_SVG}
      </button>
    </article>`;
}

function emptyStateHTML() {
  const favoritesEmpty = state.favoritesOnly;
  return `
    <div class="empty-state">
      <svg viewBox="0 0 120 100" aria-hidden="true">
        <ellipse cx="60" cy="88" rx="38" ry="6" fill="#E9D9BF" opacity=".7"/>
        <path d="M30 66c0-19 13-32 30-32s30 13 30 32c0 12-10 20-30 20s-30-8-30-20Z" fill="#FBF2E3" stroke="#8A6547" stroke-width="3"/>
        <circle cx="38" cy="38" r="11" fill="#FBF2E3" stroke="#8A6547" stroke-width="3"/>
        <circle cx="82" cy="38" r="11" fill="#FBF2E3" stroke="#8A6547" stroke-width="3"/>
        <circle cx="38" cy="38" r="5" fill="#F2C9C9"/>
        <circle cx="82" cy="38" r="5" fill="#F2C9C9"/>
        <path d="M48 60q5 4 10 0M62 60q5 4 10 0" fill="none" stroke="#6E4E33" stroke-width="2.2" stroke-linecap="round"/>
        <ellipse cx="60" cy="68" rx="3.4" ry="2.6" fill="#6E4E33"/>
        <ellipse cx="35" cy="65" rx="4.5" ry="2.6" fill="#EFBFC0" opacity=".8"/>
        <ellipse cx="85" cy="65" rx="4.5" ry="2.6" fill="#EFBFC0" opacity=".8"/>
        <text x="92" y="38" font-size="14" fill="#B7A48B" font-family="Quicksand, sans-serif">z</text>
        <text x="102" y="28" font-size="10" fill="#B7A48B" font-family="Quicksand, sans-serif">z</text>
      </svg>
      <h3>${favoritesEmpty ? '收藏夹还软软的空着' : '这里暂时没有甜甜的店'}</h3>
      <p>${favoritesEmpty ? '把喜欢的甜品店点小心心收进来吧。' : '换一个关键词，或者把筛选放松一点点。'}</p>
      <button class="empty-reset" type="button" data-reset-filters>${favoritesEmpty ? '去逛逛甜品' : '重新找找'}</button>
    </div>`;
}

function updateResultsHeading(count, list = []) {
  const query = state.query.trim();
  const city = state.activeCity ? cityIndex[state.activeCity] : null;
  const cityCount = new Set(list.map((shop) => shop.city)).size;

  if (state.favoritesOnly) {
    el.resultsTitle.textContent = '我的甜甜收藏';
  } else if (query) {
    el.resultsTitle.textContent = '搜索结果';
  } else if (city) {
    el.resultsTitle.textContent = `${city.name}的甜品店`;
  } else {
    el.resultsTitle.textContent = '甜甜的店';
  }

  const liveCount = allLiveShops().length;
  let sub = '';
  if (query) {
    sub = `为「${esc(query)}」找到 <strong>${count}</strong> 家甜甜的店`;
  } else if (city) {
    sub = `在这座城市找到 <strong>${count}</strong> 家甜甜的店 · ${city.tagline}`;
  } else if (state.favoritesOnly) {
    sub = `一共收藏了 <strong>${count}</strong> 家小店`;
  } else {
    sub = cityCount
      ? `为你收集了 <strong>${count}</strong> 家甜甜的店，散落在 ${cityCount} 座城市`
      : '把筛选放松一点点，就有甜甜的店出现啦';
  }
  if (liveCount && !query) {
    sub += ` · 含 ${liveCount} 家实时数据`;
  }
  el.resultsSub.innerHTML = sub;
}

function renderResults() {
  const list = getResults();
  updateResultsHeading(list.length, list);

  if (!list.length) {
    el.results.innerHTML = emptyStateHTML();
    return;
  }

  el.results.innerHTML = list.map(cardHTML).join('');
}

function highlightCard(shopId) {
  const cards = el.results.querySelectorAll('.shop-card');
  let target = null;
  cards.forEach((card) => {
    const isTarget = card.dataset.shop === shopId;
    card.classList.toggle('is-selected', isTarget);
    if (isTarget) target = card;
  });
  if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ----------------------------- 筛选 UI ----------------------------- */

function buildFilterChips() {
  el.regionChips.innerHTML = REGIONS.map((region) => `
    <button class="chip ${region.id === state.region ? 'is-active' : ''}" type="button" data-region="${region.id}">
      <span class="chip-emoji">${region.emoji}</span>${region.label}
    </button>`).join('');

  el.categoryChips.innerHTML = CATEGORIES.map((category) => `
    <button class="chip ${category.id === state.category ? 'is-active' : ''}" type="button" data-category="${category.id}">
      <span class="chip-emoji">${category.emoji}</span>${category.short}
    </button>`).join('');
}

function syncFilterUI() {
  el.regionChips.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.region === state.region);
  });
  el.categoryChips.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.category === state.category);
  });
  el.ratingChips.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('is-active', Number(chip.dataset.rating) === Number(state.minRating));
  });
}

function syncFavoritesUI() {
  el.favCount.textContent = String(state.favorites.size);
  el.favoritesToggle.classList.toggle('is-active', state.favoritesOnly);
  el.favoritesToggle.setAttribute('aria-pressed', String(state.favoritesOnly));
  if (el.mapFavCount) el.mapFavCount.textContent = String(state.favorites.size);
  if (el.mapFavBtn) {
    el.mapFavBtn.classList.toggle('is-active', state.favoritesOnly);
    el.mapFavBtn.setAttribute('aria-pressed', String(state.favoritesOnly));
  }
  el.liveDot.hidden = !state.googleKey;
}

function setFavoritesOnly(value) {
  state.favoritesOnly = value;
  syncFavoritesUI();
  renderResults();
  if (value) {
    showToast(state.favorites.size ? '只给你看收藏的小甜甜 ♡' : '收藏夹还空着，先点心心吧。');
  }
}

/* ----------------------------- 收藏 ----------------------------- */

function persistFavorites() {
  store.set('sweetbear.favs', JSON.stringify([...state.favorites]));
}

function toggleFavorite(shopId) {
  if (!shopsById.has(shopId)) return;
  if (state.favorites.has(shopId)) {
    state.favorites.delete(shopId);
  } else {
    state.favorites.add(shopId);
    showToast('收进甜甜收藏夹啦 ♡', 'info', 1600);
  }
  persistFavorites();
  syncFavoritesUI();

  document.querySelectorAll('[data-toggle-fav]').forEach((btn) => {
    if (btn.dataset.toggleFav !== shopId) return;
    const active = state.favorites.has(shopId);
    btn.classList.toggle('is-fav', active);
    btn.classList.add('pop');
    setTimeout(() => btn.classList.remove('pop'), 480);
    btn.setAttribute('aria-pressed', String(active));
    if (btn.classList.contains('ghost-btn')) {
      const span = btn.querySelector('span');
      if (span) span.textContent = active ? '已收藏' : '收藏小店';
    }
    const label = btn.getAttribute('aria-label') || '';
    const shop = shopsById.get(shopId);
    if (shop) {
      btn.setAttribute('aria-label', `${active ? '取消收藏' : '收藏'}${shop.name}`);
    } else if (label) {
      btn.setAttribute('aria-label', active ? '取消收藏' : '收藏');
    }
  });

  const marker = shopMarkers.get(shopId);
  const shop = shopsById.get(shopId);
  if (marker && shop) marker.setIcon(shopPinIcon(shop));

  if (state.favoritesOnly) {
    renderResults();
  }
}

/* ----------------------------- 加店流程 ----------------------------- */

function fillMyShopCategories() {
  if (!el.myShopCategory) return;
  el.myShopCategory.innerHTML = CATEGORIES
    .filter((category) => category.id !== 'all')
    .map((category) => `<option value="${esc(category.id)}">${esc(category.emoji)} ${esc(category.label)}</option>`)
    .join('');
}

function distanceKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestCity(latlng) {
  let best = CITIES[0];
  let bestDistance = Infinity;
  CITIES.forEach((city) => {
    const distance = distanceKm(
      { lat: latlng.lat, lng: latlng.lng },
      { lat: city.lat, lng: city.lng },
    );
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  });
  return best;
}

function setAddMode(on) {
  state.addMode = Boolean(on);
  const shell = document.querySelector('.map-shell');
  if (shell) shell.classList.toggle('is-adding', state.addMode);
  if (el.addHint) el.addHint.hidden = !state.addMode;
  if (el.addShopBtn) {
    el.addShopBtn.classList.toggle('is-active', state.addMode);
    const text = el.addShopBtn.querySelector('.add-fab-text');
    if (text) text.textContent = state.addMode ? '取消' : '加店';
    el.addShopBtn.title = state.addMode ? '退出加店模式' : '在地图上添加我的小店';
  }
  if (state.addMode) {
    if (map) map.closePopup();
    if (map) map.closeTooltip();
    showToast('在地图上点一下，把小店放在那里 📍', 'info', 2600);
  } else {
    state.pendingLocation = null;
  }
}

function showAddShopError(message) {
  if (!el.addShopError) return;
  el.addShopError.textContent = message;
  el.addShopError.hidden = false;
}

function beginAddAt(latlng) {
  if (!latlng) return;
  const city = nearestCity(latlng);
  state.pendingLocation = { lat: latlng.lat, lng: latlng.lng, cityId: city.id };

  if (el.addShopLoc) el.addShopLoc.textContent = `已选好位置 · 靠近 ${city.name}`;
  if (el.addShopForm) el.addShopForm.reset();
  if (el.myShopCategory) el.myShopCategory.value = 'cake';
  if (el.myShopCollect) el.myShopCollect.checked = true;
  if (el.addShopError) el.addShopError.hidden = true;

  openModal(el.addShopModal);
  setTimeout(() => { if (el.myShopName) el.myShopName.focus(); }, 120);
}

function handleAddShopSubmit(event) {
  event.preventDefault();
  const name = (el.myShopName?.value || '').trim();
  if (!name) {
    showAddShopError('先给小店起个名字吧。');
    el.myShopName?.focus();
    return;
  }
  if (!state.pendingLocation) {
    showAddShopError('还没有选好位置，点一下地图再试。');
    return;
  }

  const rawRating = Number(el.myShopRating?.value);
  const rating = Number.isFinite(rawRating) ? Math.min(5, Math.max(0, Math.round(rawRating * 10) / 10)) : 0;
  const shop = {
    id: `my-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    city: state.pendingLocation.cityId,
    category: categoryIndex[el.myShopCategory?.value] ? el.myShopCategory.value : 'cake',
    rating,
    reviewCount: 0,
    signature: (el.myShopSignature?.value || '').trim(),
    address: (el.myShopAddress?.value || '').trim(),
    hours: '',
    price: '',
    tags: ['我的小店'],
    notes: [],
    lat: state.pendingLocation.lat,
    lng: state.pendingLocation.lng,
    source: 'custom',
    createdAt: new Date().toISOString(),
  };

  addMyShop(shop);

  if (el.myShopCollect?.checked) {
    state.favorites.add(shop.id);
    persistFavorites();
    syncFavoritesUI();
  }

  closeModal(el.addShopModal);
  if (el.addShopForm) el.addShopForm.reset();

  selectCity(shop.city);
  renderResults();
  updateCityBanner();

  const created = shopsById.get(shop.id);
  if (created) setTimeout(() => focusShop(created), 220);
  showToast(`「${shop.name}」已经放进地图啦 ♡`, 'info', 2400);
}

let pendingDeleteShopId = null;
let deleteConfirmTimer = null;

function handleDeleteMyShop(button) {
  const shopId = button.dataset.deleteMyShop;
  if (!shopId) return;

  if (pendingDeleteShopId !== shopId) {
    pendingDeleteShopId = shopId;
    button.classList.add('is-confirming');
    button.textContent = '再点一次，确认删除';
    clearTimeout(deleteConfirmTimer);
    deleteConfirmTimer = setTimeout(() => {
      pendingDeleteShopId = null;
      button.classList.remove('is-confirming');
      button.textContent = '删除我的小店';
    }, 3000);
    return;
  }

  clearTimeout(deleteConfirmTimer);
  pendingDeleteShopId = null;
  removeMyShop(shopId);
  closeModal(el.shopModal);
  renderResults();
  updateCityBanner();
  refreshMapShops();
  syncFavoritesUI();
  showToast('这家小店已经从地图上拿走啦。', 'info', 2000);
}

/* ----------------------------- 地图 ----------------------------- */

const WORLD_BOUNDS = typeof L !== 'undefined'
  ? L.latLngBounds([-55, -170], [72, 185])
  : null;

function fitWorld(animate = true) {
  if (!map || !WORLD_BOUNDS) return;
  const narrow = map.getSize().x < 520;
  const minZoom = narrow ? 0 : 1;
  if (map.getMinZoom() !== minZoom) map.setMinZoom(minZoom);
  const padding = narrow ? 2 : 26;
  const options = { padding: [padding, padding], maxZoom: 3 };
  if (animate) {
    map.flyToBounds(WORLD_BOUNDS, { ...options, duration: 1.25 });
  } else {
    map.fitBounds(WORLD_BOUNDS, options);
  }
}

function markerBearSVG() {
  return '<img src="assets/brown-face.png" alt="" class="bear-pin-img" />';
}

function initMap() {
  const mapEl = document.getElementById('map');
  if (typeof L === 'undefined') {
    mapEl.innerHTML = '<div class="map-fallback">地图小熊打了个盹…<br><span>请检查网络后再刷新页面</span></div>';
    return;
  }

  map = L.map(mapEl, {
    zoomControl: false,
    minZoom: 1,
    maxZoom: 18,
    zoomSnap: 0.5,
    worldCopyJump: true,
    attributionControl: true,
    preferCanvas: false,
  });

  map.createPane('labels');
  map.getPane('labels').style.zIndex = 450;
  map.getPane('labels').style.pointerEvents = 'none';

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 18,
    maxNativeZoom: 16,
    crossOrigin: true,
  }).addTo(map);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    maxNativeZoom: 16,
    crossOrigin: true,
    pane: 'labels',
  }).addTo(map);

  if (map.attributionControl) map.attributionControl.setPrefix('');

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const clusterOptions = {
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    removeOutsideVisibleBounds: true,
    maxClusterRadius: (zoom) => (zoom <= 3 ? 140 : zoom <= 5 ? 80 : 55),
    spiderLegPolylineOptions: { weight: 1.2, color: '#B68F68', opacity: 0.45 },
  };

  if (typeof L.markerClusterGroup === 'function') {
    clusterOptions.iconCreateFunction = (cluster) => L.divIcon({
      html: `<div class="bear-cluster">${markerBearSVG()}<span class="bear-cluster-count">${cluster.getChildCount()}</span></div>`,
      className: 'bear-cluster-icon',
      iconSize: [62, 62],
      iconAnchor: [31, 31],
    });
    clusterGroup = L.markerClusterGroup(clusterOptions);
    map.addLayer(clusterGroup);
  } else {
    clusterGroup = L.layerGroup();
    map.addLayer(clusterGroup);
  }

  if (typeof L.markerClusterGroup === 'function') {
    shopLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: 42,
      spiderLegPolylineOptions: { weight: 1.2, color: '#B68F68', opacity: 0.45 },
      iconCreateFunction: (cluster) => L.divIcon({
        html: `<div class="shop-cluster"><span class="shop-cluster-count">${cluster.getChildCount()}</span><span class="shop-cluster-text">家甜店</span></div>`,
        className: 'shop-cluster-icon',
        iconSize: [58, 58],
        iconAnchor: [29, 29],
      }),
    });
    map.addLayer(shopLayer);
  } else {
    shopLayer = L.layerGroup().addTo(map);
  }

  buildCityMarkers();
  fitWorld(false);

  const keepWorldInView = () => {
    map.invalidateSize();
    if (!state.activeCity && map.getZoom() <= 3.5) fitWorld(false);
  };

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(keepWorldInView).observe(mapEl);
  } else {
    window.addEventListener('resize', keepWorldInView);
  }

  map.on('click', (event) => {
    hideSuggestions();
    if (state.addMode && event.latlng) beginAddAt(event.latlng);
  });
}

function buildCityMarkers() {
  if (!clusterGroup) return;
  clusterGroup.clearLayers();
  cityMarkers.clear();

  CITIES.forEach((city) => {
    const count = getCityShops(city.id).length;
    const icon = L.divIcon({
      className: 'city-pin-wrap',
      html: `<div class="city-pin">
        <div class="city-pin-face">${markerBearSVG()}<span class="city-pin-count">${count}</span></div>
        <div class="city-pin-tail"></div>
      </div>`,
      iconSize: [52, 60],
      iconAnchor: [26, 58],
      popupAnchor: [0, -54],
    });

    const marker = L.marker([city.lat, city.lng], {
      icon,
      title: `${city.name} · ${count} 家甜品店`,
      riseOnHover: true,
    });

    cityMarkers.set(city.id, marker);

    marker.bindTooltip(`${city.name} · ${count} 家甜店`, {
      direction: 'top',
      offset: [0, -54],
      className: 'bear-tooltip',
      opacity: 1,
    });

    marker.on('click', () => selectCity(city.id));
    clusterGroup.addLayer(marker);
  });

  syncActiveCityPin();
}

function syncActiveCityPin() {
  cityMarkers.forEach((marker, cityId) => {
    marker.setOpacity(state.activeCity && cityId === state.activeCity ? 0 : 1);
  });
}

function shopPinIcon(shop) {
  const favClass = state.favorites.has(shop.id) ? 'is-fav' : '';
  const mineClass = shop.source === 'custom' ? 'is-mine' : '';
  return L.divIcon({
    className: 'shop-pin-wrap',
    html: `<div class="shop-pin cat-${esc(shop.category)} ${favClass} ${mineClass}">
      <div class="shop-pin-bubble">${dessertArt(shop.category)}</div>
      <div class="shop-pin-tail"></div>
      ${mineClass ? `<span class="pin-mine-badge" aria-hidden="true">${PAW_HEART_SVG}</span>` : ''}
    </div>`,
    iconSize: [44, 52],
    iconAnchor: [22, 52],
    popupAnchor: [0, -54],
  });
}

function popupHTML(shop) {
  const city = cityIndex[shop.city] || {};
  const isFav = state.favorites.has(shop.id);
  const liveBadge = shop.source === 'google' ? ' · 实时' : '';
  const mineBadge = shop.source === 'custom' ? ' · 我的小店' : '';
  return `
    <div class="popup-card cat-${esc(shop.category)}">
      <div class="popup-top">
        <div class="popup-art" aria-hidden="true">${dessertArt(shop.category)}</div>
        <div>
          <h3 class="popup-name">${esc(shop.name)}</h3>
          <p class="popup-meta">${esc(city.name || shop.cityName)} · ${esc(shop.categoryLabel)}${liveBadge}${mineBadge}</p>
        </div>
      </div>
      <div class="popup-rating">
        ${starsHTML(shop.rating)}
        <span class="rating-number">${scoreText(shop.rating)}</span>
        <span class="rating-count">${shop.reviewCount ? `${formatCount(shop.reviewCount)} 条评分` : '暂无评分'}</span>
      </div>
      <p class="popup-signature">${esc(shop.address || '地址藏在甜点香气里')}</p>
      <div class="popup-actions">
        <button class="popup-detail-btn" type="button" data-open-shop="${esc(shop.id)}">看看店家小档案</button>
        <button class="popup-fav-btn ${isFav ? 'is-fav' : ''}" type="button" data-toggle-fav="${esc(shop.id)}" aria-label="${isFav ? '取消收藏' : '收藏'}${esc(shop.name)}" aria-pressed="${isFav}">
          ${HEART_SVG}
        </button>
      </div>
    </div>`;
}

function refreshMapShops() {
  if (!shopLayer) return;
  shopLayer.clearLayers();
  shopMarkers.clear();
  syncActiveCityPin();
  if (!state.activeCity) return;

  getCityShops(state.activeCity).forEach((shop) => {
    if (typeof shop.lat !== 'number' || typeof shop.lng !== 'number') return;
    const marker = L.marker([shop.lat, shop.lng], {
      icon: shopPinIcon(shop),
      title: shop.name,
      riseOnHover: true,
      zIndexOffset: shop.source === 'custom' ? 900 : 500,
    });

    marker.bindPopup(popupHTML(shop), {
      maxWidth: 290,
      minWidth: 252,
      autoPanPaddingTopLeft: [24, 120],
      autoPanPaddingBottomRight: [24, 56],
      closeButton: true,
      autoClose: true,
      className: 'sweet-popup',
    });

    marker.on('popupopen', () => highlightCard(shop.id));
    marker.addTo(shopLayer);
    shopMarkers.set(shop.id, marker);
  });
}

function updateCityBanner() {
  if (!state.activeCity) {
    el.cityBanner.hidden = true;
    el.mapTip.hidden = false;
    return;
  }

  const city = cityIndex[state.activeCity];
  if (!city) return;

  const shops = getCityShops(city.id);
  const liveCount = (state.liveShops[city.id] || []).length;
  el.cityBannerName.textContent = city.name;
  el.cityBannerEn.textContent = city.en;
  el.cityBannerSub.textContent = `${shops.length} 家甜甜的店 · ${city.tagline}${liveCount ? ` · 含 ${liveCount} 家 Google 实时` : ''}`;
  el.cityBanner.hidden = false;
  el.mapTip.hidden = true;

  const hasLive = liveCount > 0;
  el.googleFetchBtn.classList.toggle('is-live', hasLive);
  el.googleFetchLabel.textContent = hasLive ? '刷新 Google 评分' : 'Google 实时评分';
  el.googleFetchBtn.title = state.googleKey
    ? '从 Google Places 获取实时店铺与评分'
    : '需要先在「数据源」里填入 Google Maps API Key';
}

function selectCity(cityId, options = {}) {
  const city = cityIndex[cityId];
  if (!city) return;

  state.activeCity = cityId;
  state.query = '';
  el.searchInput.value = '';
  el.searchClear.hidden = true;
  hideSuggestions();

  state.category = 'all';
  state.minRating = 0;
  state.region = city.region;
  state.favoritesOnly = false;

  syncFilterUI();
  syncFavoritesUI();
  updateCityBanner();
  refreshMapShops();
  renderResults();

  if (options.fly !== false && map) {
    map.closePopup();
    map.flyTo([city.lat, city.lng], Math.max(city.zoom || 12, 11), { duration: 1.25 });
  }
}

function exitCity() {
  state.activeCity = null;
  updateCityBanner();
  refreshMapShops();
  renderResults();
  if (map) map.closePopup();
  fitWorld(true);
}

function focusShop(shop, options = {}) {
  if (!shop) return;
  const cityChanged = state.activeCity !== shop.city;

  if (cityChanged) {
    state.activeCity = shop.city;
    updateCityBanner();
    refreshMapShops();
    if (!state.query.trim()) renderResults();
  }

  if (options.setQuery) {
    state.query = shop.name;
    el.searchInput.value = shop.name;
    el.searchClear.hidden = false;
    hideSuggestions();
    renderResults();
  }

  highlightCard(shop.id);

  if (!map) return;
  const targetZoom = 16;
  const current = map.getCenter();
  const distance = current.distanceTo(L.latLng(shop.lat, shop.lng));
  let opened = false;

  const openPopup = () => {
    if (opened) return;
    opened = true;
    const marker = shopMarkers.get(shop.id);
    if (marker) {
      if (typeof shopLayer.zoomToShowLayer === 'function') {
        shopLayer.zoomToShowLayer(marker, () => marker.openPopup());
      } else {
        marker.openPopup();
      }
    }
    highlightCard(shop.id);
  };

  map.closePopup();

  if (distance < 60 && map.getZoom() === targetZoom) {
    setTimeout(openPopup, 80);
  } else {
    map.flyTo([shop.lat, shop.lng], targetZoom, { duration: 1.15 });
    map.once('moveend', openPopup);
    setTimeout(openPopup, 1500);
  }
}

/* ----------------------------- 搜索 ----------------------------- */

function setSearchQuery(value) {
  state.query = value;
  el.searchInput.value = value;
  el.searchClear.hidden = !value;
}

function hideSuggestions() {
  el.suggestions.hidden = true;
  el.suggestions.innerHTML = '';
  suggestActiveIndex = -1;
}

function buildSuggestions() {
  const query = state.query.trim();
  if (!query) {
    hideSuggestions();
    return;
  }

  const shopMatches = searchShops(query).slice(0, 4);
  const cityMatches = searchCities(query).slice(0, 3);

  let html = '';

  if (shopMatches.length) {
    html += `<div class="suggestion-group"><p class="suggestion-label">甜甜的店</p>`;
    html += shopMatches.map((shop) => {
      const city = cityIndex[shop.city] || {};
      return `<button class="suggestion-item" type="button" data-kind="shop" data-id="${esc(shop.id)}">
        <span class="suggestion-avatar" aria-hidden="true">${dessertArt(shop.category)}</span>
        <span class="suggestion-main">
          <span class="suggestion-name">${esc(shop.name)}</span>
          <span class="suggestion-meta">${esc(city.name)} · ${esc(shop.categoryLabel)} · ${esc(shop.signature || '')}</span>
        </span>
        <span class="suggestion-score">${scoreText(shop.rating)}</span>
      </button>`;
    }).join('');
    html += `</div>`;
  }

  if (cityMatches.length) {
    html += `<div class="suggestion-group"><p class="suggestion-label">城市</p>`;
    html += cityMatches.map((city) => {
      const count = getCityShops(city.id).length;
      return `<button class="suggestion-item" type="button" data-kind="city" data-id="${esc(city.id)}">
        <span class="suggestion-avatar" aria-hidden="true">${avatarSVG('brown')}</span>
        <span class="suggestion-main">
          <span class="suggestion-name">${esc(city.name)} · ${esc(city.en)}</span>
          <span class="suggestion-meta">${esc(city.country)} · ${esc(city.tagline)}</span>
        </span>
        <span class="suggestion-score">${count} 家</span>
      </button>`;
    }).join('');
    html += `</div>`;
  }

  if (!html) {
    html = `<div class="suggestion-empty">没有找到匹配的甜点，换个软乎乎的词试试？🐻</div>`;
  }

  el.suggestions.innerHTML = html;
  el.suggestions.hidden = false;
  suggestActiveIndex = -1;
}

function moveSuggestion(direction) {
  const items = [...el.suggestions.querySelectorAll('.suggestion-item')];
  if (!items.length) return;
  items.forEach((item) => item.classList.remove('is-active'));
  suggestActiveIndex = (suggestActiveIndex + direction + items.length) % items.length;
  const active = items[suggestActiveIndex];
  active.classList.add('is-active');
  active.scrollIntoView({ block: 'nearest' });
}

function chooseSuggestion(item) {
  if (!item) return;
  const kind = item.dataset.kind;
  const id = item.dataset.id;

  if (kind === 'city') {
    selectCity(id);
    return;
  }

  const shop = shopsById.get(id);
  if (!shop) return;
  state.query = shop.name;
  el.searchInput.value = shop.name;
  el.searchClear.hidden = false;
  hideSuggestions();
  renderResults();
  focusShop(shop);
}

function handleSearchInput() {
  state.query = el.searchInput.value;
  el.searchClear.hidden = !state.query;
  buildSuggestions();
  renderResults();

  clearTimeout(searchFlyTimer);
  const query = state.query.trim();
  if (query.length < 2) return;

  searchFlyTimer = setTimeout(() => {
    const shopMatches = searchShops(query);
    const cityMatches = searchCities(query);
    const targetCityId = shopMatches[0]?.city || cityMatches[0]?.id;
    if (!targetCityId || !map) return;
    const city = cityIndex[targetCityId];
    if (!city) return;

    if (state.activeCity !== city.id) {
      state.activeCity = city.id;
      updateCityBanner();
      refreshMapShops();
      map.flyTo([city.lat, city.lng], Math.max(city.zoom || 12, 11), { duration: 1.15 });
    }
  }, 680);
}

/* ----------------------------- 弹层 ----------------------------- */

function openModal(modalEl) {
  if (!modalEl) return;
  if (modalEl !== el.addShopModal && state.addMode) setAddMode(false);
  lastFocusedElement = document.activeElement;
  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  const closeBtn = modalEl.querySelector('.modal-close');
  if (closeBtn) setTimeout(() => closeBtn.focus(), 80);
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (modalEl === el.addShopModal) setAddMode(false);
  if (currentModalShopId && modalEl === el.shopModal) currentModalShopId = null;
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus({ preventScroll: true });
  }
}

function noteCardHTML(note, index) {
  const sourceLabel = note.source === 'google' || note.source === 'Google' ? 'Google' : '小甜客';
  const avatar = note.avatar || (['brown', 'white', 'chick'][index % 3]);
  return `
    <div class="note-card">
      <span class="note-avatar" aria-hidden="true">${avatarSVG(avatar)}</span>
      <div class="note-main">
        <p class="note-author">${esc(note.author || '一位小甜客')}<span class="note-source">${sourceLabel}</span></p>
        <p class="note-text">${esc(note.text || '这家店还没有留下文字评价。')}</p>
      </div>
    </div>`;
}

function openShopModal(shop) {
  if (!shop) return;
  currentModalShopId = shop.id;
  const city = cityIndex[shop.city] || {};
  const isFav = state.favorites.has(shop.id);
  const live = shop.source === 'google';
  const mine = shop.source === 'custom';
  const price = priceText(shop.price);
  const tags = (shop.tags || []).filter(Boolean).slice(0, 5);
  const notes = (shop.notes || []).filter(Boolean).slice(0, 3);

  el.shopModalBody.innerHTML = `
    <div class="shop-hero cat-${esc(shop.category)}">
      <p class="eyebrow">SWEET SPOT · ${esc((city.en || city.name || 'SWEET').toUpperCase())}</p>
      <h2 id="shopModalTitle">${esc(shop.name)}</h2>
      <p class="shop-hero-city">
        <span>${esc(city.name || shop.cityName)} · ${esc(city.country || '')}</span>
        <span class="hero-chip">${esc(shop.categoryEmoji || '🍰')} ${esc(shop.categoryLabel)}</span>
        ${price ? `<span class="hero-chip">${esc(price)}</span>` : ''}
        ${live ? '<span class="hero-chip">Google 实时</span>' : ''}
        ${mine ? `<span class="hero-chip my-hero-chip">${PAW_HEART_SVG}我的小店</span>` : ''}
      </p>
      <div class="shop-hero-rating">
        ${starsHTML(shop.rating)}
        <span class="big-score">${scoreText(shop.rating)}</span>
        <span class="rating-count">${shop.reviewCount ? `${formatCount(shop.reviewCount)} 条${live ? ' Google 评分' : '参考评分'}` : '暂无评分'}</span>
      </div>
      <div class="shop-hero-art" aria-hidden="true">${dessertArt(shop.category)}</div>
    </div>
    <div class="shop-body">
      <p class="shop-signature"><strong>招牌 · </strong>${esc(shop.signature || '今天的甜点')}${shop.desc ? `<br>${esc(shop.desc)}` : ''}</p>
      <div class="info-grid">
        <div class="info-cell full">
          <span class="info-label">地址 · ADDRESS</span>
          <span class="info-value">${esc(shop.address || '地址藏在甜点香气里')}</span>
        </div>
        <div class="info-cell">
          <span class="info-label">营业时间 · HOURS</span>
          <span class="info-value">${esc(shop.hours || '请以店家公告为准')}</span>
        </div>
        <div class="info-cell">
          <span class="info-label">甜度预算 · PRICE</span>
          <span class="info-value">${esc(price || '未标注')}</span>
        </div>
      </div>
      ${tags.length ? `<div class="shop-tags">${tags.map((tag) => `<span class="shop-tag">${esc(tag)}</span>`).join('')}</div>` : ''}
      <h4 class="section-title">小甜客笔记</h4>
      <div class="notes-list">
        ${notes.length ? notes.map(noteCardHTML).join('') : '<div class="note-card"><span class="note-avatar" aria-hidden="true">' + avatarSVG('white') + '</span><div class="note-main"><p class="note-author">松松<span class="note-source">小甜客</span></p><p class="note-text">还没有人留下笔记，等你来写第一条甜甜的回忆。</p></div></div>'}
      </div>
      <div class="shop-actions">
        <a class="primary-btn" href="${googleMapsUrl(shop)}" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
          在 Google Maps 查看
        </a>
        <button class="ghost-btn ${isFav ? 'is-fav' : ''}" type="button" data-toggle-fav="${esc(shop.id)}" aria-pressed="${isFav}">
          ${HEART_SVG} <span>${isFav ? '已收藏' : '收藏小店'}</span>
        </button>
        ${mine ? `<button class="ghost-btn my-shop-delete" type="button" data-delete-my-shop="${esc(shop.id)}">删除我的小店</button>` : ''}
      </div>
      <p class="shop-source-line">${mine
        ? '这是你自己放进地图的小店，收藏信息只保存在当前浏览器里。'
        : live
          ? '店铺、评分与评论来自 Google Places，实时获取，可能会继续更新。'
          : '店铺与评分为精选整理，仅作灵感参考；营业时间可能变动，出发前建议在 Google Maps 确认。'}</p>
    </div>`;

  openModal(el.shopModal);
}

/* ----------------------------- Google Places ----------------------------- */

const GOOGLE_FIELDS_FULL = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.priceLevel',
  'places.primaryTypeDisplayName',
  'places.reviews',
].join(',');

const GOOGLE_FIELDS_TEST = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
].join(',');

const PRICE_LEVEL_MAP = {
  PRICE_LEVEL_FREE: '亲民',
  PRICE_LEVEL_INEXPENSIVE: '亲民',
  PRICE_LEVEL_MODERATE: '小奢',
  PRICE_LEVEL_EXPENSIVE: '约会级',
  PRICE_LEVEL_VERY_EXPENSIVE: '约会级',
};

async function googleTextSearch(key, body, fields) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fields,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json();
      detail = errorBody?.error?.message || '';
    } catch (err) { /* ignore */ }
    throw new Error(detail || `Google 返回了 HTTP ${response.status}`);
  }

  return response.json();
}

function inferCategory(text) {
  const value = String(text || '').toLowerCase();
  if (/(matcha|green tea|抹茶)/.test(value)) return 'matcha';
  if (/(gelato|ice cream|冰淇淋|意式冰淇淋)/.test(value)) return 'gelato';
  if (/(bingsu|shaved|snow ice|刨冰|雪冰)/.test(value)) return 'shaved';
  if (/(macaron|马卡龙)/.test(value)) return 'macaron';
  if (/(chocolate|巧克力)/.test(value)) return 'chocolate';
  if (/(tart|pie|egg tart|挞|派)/.test(value)) return 'tart';
  if (/(pudding|custard|sweet soup|布丁|糖水)/.test(value)) return 'pudding';
  if (/(fruit|mango|parfait|水果|芒果)/.test(value)) return 'fruit';
  if (/(bakery|bake|croissant|bread|pastry|可颂|面包|烘焙)/.test(value)) return 'bakery';
  return 'cake';
}

function liveShopFromPlace(place, city) {
  const name = place.displayName?.text || 'Google 甜点店';
  const typeName = place.primaryTypeDisplayName?.text || 'Dessert shop';
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];
  const category = inferCategory(`${typeName} ${name}`);
  const price = PRICE_LEVEL_MAP[place.priceLevel] || '未标注';

  const notes = reviews
    .map((review, index) => {
      const text = review.text?.text || review.originalText?.text || '';
      if (!text) return null;
      return {
        author: review.authorAttribution?.displayName || 'Google 用户',
        avatar: ['brown', 'white', 'chick'][index % 3],
        text: text.length > 220 ? `${text.slice(0, 220)}…` : text,
        source: 'Google',
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  return {
    id: `live-${place.id}`,
    city: city.id,
    name,
    nameEn: name,
    category,
    rating: place.rating || 0,
    reviewCount: place.userRatingCount || 0,
    price,
    signature: typeName,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    address: place.formattedAddress || '',
    hours: '请以 Google Maps 为准',
    tags: [typeName, 'Google 实时', city.name],
    desc: '来自 Google Places 的实时店铺信息，评分与评论会随 Google 更新。',
    notes,
    googleMapsUri: place.googleMapsUri || '',
    source: 'google',
    cityName: city.name,
    cityEn: city.en,
    country: city.country,
    cityRegion: city.region,
    categoryLabel: categoryIndex[category]?.label || '甜点',
    categoryEmoji: categoryIndex[category]?.emoji || '🍰',
  };
}

async function fetchGoogleShopsForCity(cityId) {
  const city = cityIndex[cityId];
  if (!city) return;
  if (!state.googleKey) {
    openSettingsModal();
    showToast('先填一个 Google Maps API Key，就能喝到新鲜的评分啦。');
    return;
  }

  const button = el.googleFetchBtn;
  const originalLabel = el.googleFetchLabel.textContent;
  button.disabled = true;
  el.googleFetchLabel.textContent = '正在问 Google…';

  try {
    const data = await googleTextSearch(
      state.googleKey,
      {
        textQuery: `best dessert cafe in ${city.en}`,
        maxResultCount: 8,
        languageCode: 'zh-CN',
        locationBias: {
          circle: {
            center: { latitude: city.lat, longitude: city.lng },
            radius: 6000,
          },
        },
      },
      GOOGLE_FIELDS_FULL,
    );

    const places = Array.isArray(data.places) ? data.places : [];
    const found = places
      .map((place) => liveShopFromPlace(place, city))
      .filter((shop) => typeof shop.lat === 'number' && typeof shop.lng === 'number');

    if (!found.length) {
      showToast('Google 没有找到附近的甜品店，再试一次看看？');
      return;
    }

    const shops = found.filter((shop) => !isCuratedTwin(shop));
    if (!shops.length) {
      showToast('Google 找到的店都已经在精选名单里啦，评分可以参考下方笔记 ♡');
      return;
    }

    state.liveShops[cityId] = shops;
    rebuildSearchIndex();
    buildCityMarkers();
    refreshMapShops();
    renderResults();
    updateCityBanner();
    showToast(`从 Google 带回了 ${shops.length} 家实时甜品店 🍮`);
  } catch (error) {
    const message = String(error?.message || '未知错误');
    showToast(`Google 说：${message.slice(0, 120)}`, 'error', 4200);
  } finally {
    button.disabled = false;
    if (state.activeCity) updateCityBanner();
    else el.googleFetchLabel.textContent = originalLabel;
  }
}

/* ----------------------------- 设置 ----------------------------- */

function setKeyStatus(type, message) {
  el.keyStatus.hidden = false;
  el.keyStatus.className = `key-status ${type ? `is-${type}` : ''}`;
  el.keyStatus.textContent = message;
}

function openSettingsModal() {
  el.googleKeyInput.value = state.googleKey;
  if (state.googleKey) {
    setKeyStatus('ok', '已保存一个 Key。打开任意城市，点击「Google 实时评分」就能获取实时评分。');
  } else {
    el.keyStatus.hidden = true;
    el.keyStatus.textContent = '';
  }
  openModal(el.settingsModal);
}

async function testGoogleKey() {
  const key = el.googleKeyInput.value.trim() || state.googleKey;
  if (!key) {
    setKeyStatus('error', '还没有填 Key 呢，先去 Google Cloud 创建一个吧。');
    return;
  }

  setKeyStatus('loading', '正在轻轻敲 Google 的门…');
  el.testKeyBtn.disabled = true;
  el.testKeyBtn.textContent = '测试中…';

  try {
    const data = await googleTextSearch(
      key,
      { textQuery: 'dessert shop in Tokyo', maxResultCount: 1, languageCode: 'zh-CN' },
      GOOGLE_FIELDS_TEST,
    );
    const place = data.places?.[0];
    if (!place) throw new Error('连接成功，但 Google 没有返回店铺数据。');
    const name = place.displayName?.text || '一家甜品店';
    const rating = place.rating ? ` · ${place.rating} 星` : '';
    setKeyStatus('ok', `连接成功！Google 回了一句：「${name}」${rating}`);
  } catch (error) {
    const message = String(error?.message || '未知错误');
    setKeyStatus('error', `没连上：${message.slice(0, 180)}`);
  } finally {
    el.testKeyBtn.disabled = false;
    el.testKeyBtn.textContent = '测试连接';
  }
}

function saveGoogleKey() {
  const key = el.googleKeyInput.value.trim();
  if (!key) {
    setKeyStatus('error', 'Key 还是空的，填入后才能解锁实时评分。');
    return;
  }
  state.googleKey = key;
  store.set('sweetbear.googleKey', key);
  syncFavoritesUI();
  setKeyStatus('ok', 'Key 已保存在本机浏览器。打开任意城市，点击「Google 实时评分」即可。');
  showToast('数据源准备好啦，Google 评分随时待命。');
}

function clearGoogleKey() {
  state.googleKey = '';
  store.remove('sweetbear.googleKey');
  el.googleKeyInput.value = '';
  syncFavoritesUI();
  setKeyStatus('ok', '已移除 Key，网站回到精选数据模式。');
  showToast('已回到精选数据模式。');
}

/* ----------------------------- 事件绑定 ----------------------------- */

function bindEvents() {
  /* 搜索 */
  el.searchInput.addEventListener('input', handleSearchInput);

  el.searchInput.addEventListener('focus', () => {
    if (state.query.trim()) buildSuggestions();
  });

  el.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSuggestion(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSuggestion(-1);
    } else if (event.key === 'Enter') {
      const items = el.suggestions.querySelectorAll('.suggestion-item');
      if (!el.suggestions.hidden && items.length) {
        event.preventDefault();
        const active = el.suggestions.querySelector('.suggestion-item.is-active') || items[0];
        chooseSuggestion(active);
      }
    } else if (event.key === 'Escape') {
      hideSuggestions();
      el.searchInput.blur();
    }
  });

  el.searchClear.addEventListener('click', () => {
    setSearchQuery('');
    hideSuggestions();
    renderResults();
    el.searchInput.focus();
  });

  el.suggestions.addEventListener('click', (event) => {
    const item = event.target.closest('.suggestion-item');
    if (item) chooseSuggestion(item);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-wrap')) hideSuggestions();
  });

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (event.key === '/' && !typing) {
      event.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
    }

    if (event.key === 'Escape') {
      const openLayer = document.querySelector('.modal-layer.is-open');
      if (openLayer) closeModal(openLayer);
      else if (state.addMode) setAddMode(false);
      else hideSuggestions();
    }
  });

  /* 筛选 */
  el.regionChips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-region]');
    if (!chip) return;
    state.region = chip.dataset.region;
    syncFilterUI();
    renderResults();
  });

  el.categoryChips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (!chip) return;
    state.category = chip.dataset.category;
    syncFilterUI();
    renderResults();
  });

  el.ratingChips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-rating]');
    if (!chip) return;
    state.minRating = Number(chip.dataset.rating);
    syncFilterUI();
    renderResults();
  });

  el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    renderResults();
  });

  /* 收藏 */
  el.favoritesToggle.addEventListener('click', () => {
    setFavoritesOnly(!state.favoritesOnly);
  });

  if (el.mapFavBtn) {
    el.mapFavBtn.addEventListener('click', () => {
      setFavoritesOnly(!state.favoritesOnly);
      if (state.favoritesOnly && state.activeCity) {
        const first = getResults()[0];
        if (first) setTimeout(() => focusShop(first), 120);
      }
    });
  }

  /* 加店 */
  if (el.addShopBtn) {
    el.addShopBtn.addEventListener('click', () => setAddMode(!state.addMode));
  }
  if (el.cancelAddBtn) {
    el.cancelAddBtn.addEventListener('click', () => setAddMode(false));
  }
  if (el.addShopForm) {
    el.addShopForm.addEventListener('submit', handleAddShopSubmit);
    el.addShopForm.addEventListener('input', () => {
      if (el.addShopError) el.addShopError.hidden = true;
    });
  }

  /* 结果列表 */
  el.results.addEventListener('click', (event) => {
    if (event.target.closest('[data-toggle-fav]')) return;
    if (event.target.closest('[data-reset-filters]')) {
      resetFilters();
      return;
    }
    const card = event.target.closest('[data-shop]');
    if (card) {
      const shop = shopsById.get(card.dataset.shop);
      if (shop) focusShop(shop);
    }
  });

  el.results.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-shop]');
    if (!card) return;
    event.preventDefault();
    const shop = shopsById.get(card.dataset.shop);
    if (shop) focusShop(shop);
  });

  /* 地图上的城市与面包屑 */
  el.exitCityBtn.addEventListener('click', exitCity);
  el.randomBtn.addEventListener('click', goRandom);
  el.googleFetchBtn.addEventListener('click', () => {
    if (!state.activeCity) return;
    fetchGoogleShopsForCity(state.activeCity);
  });

  /* 品牌 / 回到世界 */
  el.brandHome.addEventListener('click', resetAll);

  /* 设置 */
  el.settingsBtn.addEventListener('click', openSettingsModal);
  el.noteSettings.addEventListener('click', openSettingsModal);
  el.keyEye.addEventListener('click', () => {
    const isPassword = el.googleKeyInput.type === 'password';
    el.googleKeyInput.type = isPassword ? 'text' : 'password';
    el.keyEye.textContent = isPassword ? '隐藏' : '显示';
  });
  el.saveKeyBtn.addEventListener('click', saveGoogleKey);
  el.testKeyBtn.addEventListener('click', testGoogleKey);
  el.clearKeyBtn.addEventListener('click', clearGoogleKey);

  /* 弹层关闭 */
  document.addEventListener('click', (event) => {
    const closeTrigger = event.target.closest('[data-close]');
    if (closeTrigger) {
      closeModal(document.getElementById(closeTrigger.dataset.close));
      return;
    }

    const favTrigger = event.target.closest('[data-toggle-fav]');
    if (favTrigger) {
      toggleFavorite(favTrigger.dataset.toggleFav);
      return;
    }

    const deleteTrigger = event.target.closest('[data-delete-my-shop]');
    if (deleteTrigger) {
      handleDeleteMyShop(deleteTrigger);
      return;
    }

    const openShopTrigger = event.target.closest('[data-open-shop]');
    if (openShopTrigger) {
      const shop = shopsById.get(openShopTrigger.dataset.openShop);
      if (map) map.closePopup();
      if (shop) openShopModal(shop);
    }
  });
}

function resetFilters() {
  state.query = '';
  el.searchInput.value = '';
  el.searchClear.hidden = true;
  state.region = 'all';
  state.category = 'all';
  state.minRating = 0;
  state.favoritesOnly = false;
  state.activeCity = null;

  syncFilterUI();
  syncFavoritesUI();
  updateCityBanner();
  refreshMapShops();
  renderResults();
  hideSuggestions();
  fitWorld(true);
}

function resetAll() {
  resetFilters();
  if (map) map.closePopup();
  el.results.scrollTop = 0;
}

function goRandom() {
  const pool = getAllShops();
  if (!pool.length) return;
  const shop = pool[Math.floor(Math.random() * pool.length)];

  state.query = '';
  el.searchInput.value = '';
  el.searchClear.hidden = true;
  state.category = 'all';
  state.minRating = 0;
  state.region = 'all';
  state.favoritesOnly = false;
  state.activeCity = shop.city;

  syncFilterUI();
  syncFavoritesUI();
  updateCityBanner();
  refreshMapShops();
  renderResults();
  hideSuggestions();

  showToast(`松松带你去了「${shop.name}」🍰`);
  setTimeout(() => focusShop(shop), 60);
}

/* ----------------------------- 初始化 ----------------------------- */

function init() {
  rebuildSearchIndex();
  fillMyShopCategories();
  buildFilterChips();
  syncFilterUI();
  syncFavoritesUI();
  renderResults();
  initMap();
  bindEvents();
  updateCityBanner();
}

init();
