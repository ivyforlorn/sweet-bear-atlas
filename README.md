# 松松熊甜品地图 · Sweet Bear Atlas

一个轻松熊风格的甜品店发现网站：在世界地图上逛 16 座城市、52 家精选甜品店，按地区 / 评分 / 品类筛选，模糊搜索店名，也可以接入 Google Places 获取实时评分与评论。

## 在线访问

已部署在 GitHub Pages，任何人可通过以下链接访问：

**<https://ivyforlorn.github.io/sweet-bear-atlas/>**

更新网站：修改文件后执行 `git add -A && git commit -m "更新说明" && git push`，GitHub Pages 会在一两分钟内自动重新发布。

## 功能一览

- **世界地图**：Esri 浅色底图，可缩放、拖动；城市用圆圆的小熊爪印聚合展示，点开小熊即可跳转到该城市的大图。
- **城市与店铺**：进入城市后显示该城市的甜品店坐标点，点击店铺弹出评分、招牌与地址，可打开详情卡片。
- **筛选**：按地区（亚洲 / 欧洲 / 北美 / 大洋洲）、最低评分（4.3+ / 4.5+ / 4.6+）、甜品品类筛选，结果实时更新。
- **搜索**：支持店名、城市、品类与招牌甜品关键字，模糊匹配（如 `laduree`、`berthilo` 也能命中）；搜索城市会自动把地图飞到对应地区并进入城市视图。
- **收藏**：详情卡片可收藏小店，收藏数量显示在右上角，刷新后仍保留（localStorage）。
- **随机吃甜**：随机挑一家店，直接打开它的城市与详情。
- **Google 实时评分**：填入自己的 Google Maps API Key 后，可在城市视图里一键拉取 Google Places 的实时店铺、评分与评论数。Key 只保存在本机浏览器，请求直接发往 Google。

## 运行方式

项目是纯静态页面，不需要构建。

**推荐（本地服务器）**

```bash
cd sweet-bear-atlas
python -m http.server 8123 --bind 127.0.0.1
```

然后打开 <http://127.0.0.1:8123/>。

**直接打开**

双击 `index.html` 也可以浏览地图、筛选和搜索。但 Google API Key 若设置了「HTTP 来源」限制，`file://` 来源可能被拒绝，此时请用上面的本地服务器方式。

> 页面需要联网加载 Leaflet、Fuse.js 和 Esri 地图瓦片，离线时地图会显示提示。

## 接入 Google Places（可选）

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，创建（或选择）一个项目。
2. 在「API 和服务 → 库」中启用 **Places API (New)**。
3. 在「凭据」中创建 API Key，建议在「应用限制」里选择 HTTP 来源并填入本地地址（如 `http://127.0.0.1:8123`）。
4. 回到网站，点右上角 **数据源 → 填入 Key → 保存**。
5. 进入任意城市，点城市横幅上的 **Google 实时评分**，即可拉取该城市附近的甜品店。

说明：

- 网站使用 `places:searchText` 的 Text Search (New)，按城市中心做圆形范围偏好，返回店名、评分、评论数、地址与坐标。
- Google Places 的调用会按 Google 的计价规则计费，请留意自己项目的配额与预算。
- 内置精选数据与 Google 返回的同名 / 同位置店铺会自动去重，不会重复显示。
- 未填 Key 时，每张详情卡片仍提供「在 Google Maps 查看」链接。

## 数据说明

- `js/data.js` 内置 16 座城市、52 家精选甜品店，包含中英文名、品类、标签、招牌甜品、坐标、评分与评论数。
- 精选评分与评论数参考公开评价整理，仅作浏览与灵感参考，不代表实时数据；以 Google Maps 上的最新信息为准。
- 地图瓦片：Esri World Light Gray Canvas Base + Reference（© Esri, DeLorme, NAVTEQ）。

## 文件结构

```
sweet-bear-atlas/
├─ index.html        页面结构（搜索、筛选、地图、弹窗）
├─ css/style.css     奶油色治愈风样式与地图自定义样式
├─ js/data.js        城市、店铺与品类数据
├─ js/app.js         地图交互、筛选、搜索、收藏、Google 接入
├─ assets/           轻松熊素材（从参考图抠出的透明 PNG）
│  ├─ bear-lie.png      躺平小熊 + 小黄鸡（首页插图）
│  ├─ brown-face.png    棕色小熊头（Logo、地图爪印、头像）
│  ├─ white-bear.png    小白熊全身（地图贴纸）
│  ├─ white-face.png    小白熊头（设置弹窗、头像）
│  └─ chick.png         小黄鸡（页脚、头像）
└─ README.md
```

## 交互小提示

- 点地图上的小熊或小熊聚合簇进入城市；点城市横幅右侧的「×」回到世界视图。
- 清空搜索会恢复当前城市的全部结果列表，地图停留在当前区域。
- 城市视图里再次点击其他城市的小熊可切换城市。
- 搜索框支持方向键选择建议、`Enter` 打开、`Esc` 收起。
- 地图右下角的 `+ / −` 用于缩放，也支持双指 / 滚轮缩放。
