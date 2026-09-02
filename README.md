# dsh-weather

DSH Web 顶部居中的天气插件：**定位信息 + 当前天气 + 未来 12 小时/7 天预报**。
数据来自 [Open-Meteo](https://open-meteo.com/)（免费、无需 API key、浏览器直连）。
自动定位优先使用**浏览器定位（GPS/WiFi，可精确到区）**，失败或拒绝时回退到
[geojs.io](https://geo.joshuamitchell.io/) IP 定位（仅市一级），区名由
[BigDataCloud](https://www.bigdatacloud.com/) 中文反向地理编码得到。

## 功能

- **顶部居中天气栏**：`📍 广东省广州市天河区 · 26° · 晴 · 体感 28°`，常驻在 Web GUI 顶部，玻璃拟态 + SVG 天气图标
- **点击展开详情**：
  - 当前天气 Hero（大图标 + 大温度）+ 湿度 / 风速 / 今日降水 / **空气质量（AQI + PM2.5）**统计卡
  - **今日信息**：日出 / 日落 / **紫外线指数** / PM2.5 + **一句话出行建议**（带伞 / 防晒 / 防暑等）
  - **未来 24 小时温度趋势曲线**（SVG 折线图）
  - 未来 12 小时逐小时预报、未来 7 天预报（带温度区间渐变条）
- **浏览器标签页标题**显示当前天气（`⛅ 26° 城市 — 应用标题`），随刷新同步
- **恶劣天气提醒**：强降雨 / 雷暴 / 高温 / 大风 / 强降雪时发送浏览器通知（可在设置中开关）
- **单位切换**：摄氏 °C / 华氏 °F（设置持久化）
- **自动刷新**：按设置的间隔自动刷新（默认 15 分钟），可手动刷新
- **两种定位方式**
  - `自动`：优先浏览器 GPS 定位（可精确到区），失败回退 IP 定位；区名由 BigDataCloud 中文反向地理编码
  - `手动`：中文城市搜索（Open-Meteo Geocoding，如「北京」「上海」），或直接填经纬度
- **配置入口**：点击天气栏 → 弹层右下角 **⚙ 设置**（显示开关、定位方式、单位、刷新间隔、恶劣天气提醒），配置持久化到 DSH 设置文档

## 安装

### 方式一：`dsh plugin`（本地开发安装）

```sh
# 在插件目录构建
pnpm install && pnpm build

# 装进 web profile（等同 dshmarket 的一键安装流程：写依赖 + 加入 bundle 层栈）
cd <deepseek-harness-checkout>
pnpm dsh plugin --profile web add D:\path\to\dsh-weather
```

重启 `dsh web`，刷新页面即可看到顶部天气栏。

> 提示：本机 pnpm 版本若与 profile 的 node_modules 布局不一致，会在
> `~/.dsh/profiles/web/.npmrc` 里加一行 `virtual-store-dir-max-length=120`。

### 方式二：发布到插件市场（上架后一键安装）

1. 发布到 npm：

   ```sh
   npm publish
   ```

2. 在 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
   的列表里加一条（含 npm 包名），PR 合并后（通常一天内）即可在
   **设置 → 插件市场** 里搜索「weather」一键安装。

   参考其他条目的字段：包名、简介、分类、star 数来源（GitHub 仓库）等。

### 手动安装（等价 `dsh plugin` 内部步骤）

1. 在 `~/.dsh/profiles/web/package.json` 的 `dependencies` 加
   `"dsh-weather": "link:<本目录绝对路径>"`，并在 `dsh.profile.bundles` 末尾加
   `"dsh-weather"`。
2. 在 `~/.dsh/profiles/web/node_modules` 下建一个指向本目录的 junction。
3. 重启 `dsh web`。

## 开发

```sh
pnpm install     # 安装 devDependencies
pnpm typecheck   # tsc 类型检查
pnpm build       # 产出 lib/index.js（Host）+ lib/client.js（浏览器 bundle）
```

### 产物契约

- `lib/index.js`：Host 半侧，Cordis 插件入口（`apply`），注册 `weather` settings
  namespace（`installSettingsSection`），供浏览器半侧持久化配置。
- `lib/client.js`：浏览器半侧，按 DSH 客户端模块系统的 lazy-CJS factory 格式构建：

  ```js
  window.__ModuleLoader__.load({ id: "dsh-weather", factory: (require) => { … return module.exports; } })
  ```

  平台模块（react / cordis / ui-slots / ui-primitives）与 `dsh.client.inject`
  声明的行（`@deepseek-ai/dsh-client-ui-settings`）走注入的 `require`，
  其余依赖全部内联。构建脚本 `scripts/build.mjs` 用 esbuild 复刻了仓库
  `packages/client/tsdown.client.ts` 的产物格式。

### 包结构

```
package.json          # dsh.bundle.patch + dsh.client（platform web, inject ui-settings）
cordis.patch.yml      # 向 profile bundle 层栈插入 dsh-weather 条目
src/index.ts          # Host 半侧：settings namespace 注册
src/config-shared.ts  # 共享配置类型（Host 与浏览器共用，浏览器侧内联）
src/client/           # 浏览器半侧
  index.tsx           #   apply：注册 shell.overlay（天气栏）+ settings.section（配置页）
  WeatherBar.tsx      #   顶部居中天气栏 + 详情弹层
  WeatherSettings.tsx #   设置页表单
  weather-api.ts      #   Open-Meteo 预报 / 城市搜索 + geojs.io IP 定位
  condition.ts        #   WMO 天气编码 → 中文文案 + emoji
scripts/build.mjs     # esbuild 构建脚本
```

## 隐私与依赖

- 天气数据：Open-Meteo（免费公共 API，浏览器直连）
- 自动定位：geojs.io（返回城市 + 坐标，浏览器直连）
- 城市搜索：Open-Meteo Geocoding（`language=zh`）
- 不收集、不上传任何用户数据；配置仅存于 DSH 本地 settings 文档

## License

MIT
