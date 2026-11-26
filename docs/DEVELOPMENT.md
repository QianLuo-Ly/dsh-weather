# 开发指南

面向想要构建、调试或二次开发 dsh-weather 的开发者。

## 环境与构建

```sh
pnpm install     # 安装 devDependencies
pnpm typecheck   # tsc 类型检查
pnpm build       # 产出 lib/index.js（Host）+ lib/client.js（浏览器 bundle）
pnpm check:lib-sync  # 校验已提交的 lib/ 与当前 src/ 一致（改动 src/ 后必跑）
```

## 本地开发安装

```sh
# 在插件目录构建
pnpm install && pnpm build

# 装进 web profile（等同插件市场的一键安装流程：写依赖 + 加入 bundle 层栈）
cd <deepseek-harness-checkout>
pnpm dsh plugin --profile web add D:\path\to\dsh-weather
```

重启 `dsh web`，刷新页面，进入会话即可在顶部操作行看到天气 chip。

> 提示：本机 pnpm 版本若与 profile 的 node_modules 布局不一致，会在
> `~/.dsh/profiles/web/.npmrc` 里加一行 `virtual-store-dir-max-length=120`。

## 宿主版本兼容（2026-11-26 核对：桌面端 0.2.2-rc.5）

`package.json` 的 `engines.dsh` 声明真实下限 `>=0.1.7-rc.2 <0.3.0-0`（0.1.7 才有 `configForms`）。
0.2.x 起宿主会在安装前后用 `engines.dsh`（或 `@deepseek-ai/dsh*` peer）做兼容检查
（`app-boot` 的 `evaluatePluginCompatibility`）：低于 0.1.7 或 0.3+ 会被明确拒绝，
而不是「装上了但 chip 不出现」。0.2.2 起多了「精确版本豁免」（`compatibility.json` +
`dsh plugin allow-version`），只在用户显式接受风险时生效，插件侧无需处理。

0.2.2-rc.5 逐项核对结论——**契约只有一处字段变更，已适配**：

| 契约 | 0.1.7 | 0.2.2-rc.5 | 依据 |
| --- | --- | --- | --- |
| `dsh.bundle.patch`、`exports["./client"]` | 支持 | 支持 | `app-boot` 的 `bundlePatchPaths`、`client-modules` 的 `clientExportOf` |
| `dsh.client.platform` / `inject` | 支持 | 支持（含可选 `external`） | 启动图里本插件行仍带 `inject: ["@deepseek-ai/dsh-client-ui-settings"]` |
| 客户端注册 `window.__ModuleLoader__.load({id, factory})` | 一致 | 一致 | 宿主自带包 `lib/client.js` 首行同格式；`id` 仍必须逐字等于包名 |
| `ctx.slots`（`inject`/`register`）、slot 名 `conversation.session.header.actions`、`settings.section` | 一致 | 一致 | `ui-renderer` 仍 `super(ctx, "slots")`；`conversation.session.header.actions` 仍是 `{kind:'list',scope:'session'}`，`settings.section` 仍是 `{kind:'list',scope:'root'}` |
| `ctx.configForms.get(entryId)` → `ConfigForm{getSnapshot,subscribe,set,unset,mutate}` | 一致 | 一致 | `ui-settings` 同名服务、同名方法 |
| 设置投影：ns = 行 id、schema = `Config`、仅 `.volatile()` 可写 | 一致 | 一致 | `dsh-settings` 仍用 `entry.options.id` + `volatileForm` |
| **`ConfigFormSnapshot` 字段** | `mode`（含 `memory`） | **`status: 'loading' \| 'ready' \| 'unavailable'`**（另有 `value`/`base`/`user`/`revision`/`writable`） | `ui-settings/src/client/config-form-types.ts`；`WeatherSettingsSection` 的提示行已改为按 `status === 'unavailable'` 显示 |

实测方法（临时 profile，不碰用户 profile；`DSH_HOME` 指到工作区便于沙箱写入）：

```sh
export DSH_HOME='<repo>/.workbuddy/scratch/dsh-home'
dsh --profile webcopy --from-default-profile web --dump-config   # 从自带 web 模板复制
dsh plugin --profile webcopy add 'file:<repo>'
dsh --profile webcopy --dump-config        # 组合树里出现 - id: dsh-weather
env -u NODE_OPTIONS dsh --profile webcopy --no-open --port 9850  # 页面 __DSH_BOOT__ 中含
                                                                 # @qianluo-ly/dsh-weather/client.js
```

> ⚠️ 两个只在开发机出现的坑：
> 1. `dsh web` 的 app 名本身就是 profile 别名，`web --profile X` 会报 `select a profile only once`；
>    正确写法是 `dsh --profile X`（不带 `web`）。自定义 profile 若没有从 `web` 模板复制，
>    起来是个空壳，web 端口永远不监听。
> 2. WorkBuddy 沙箱注入的 `NODE_OPTIONS` 会让宿主子进程继承 safe-delete 垫片，
>    `dsh-atomic-write` 的每次写入都可能 `SAFE_DELETE_BULK_GUARD_ERROR`；验证时用
>    `env -u NODE_OPTIONS -u CODEBUDDY_SAFE_DELETE_SANDBOX` 起宿主。

devDependencies 已对齐宿主 `0.2.2-rc.5`（cordis 4.1.0 / schemastery 3.19.0）。`peerDependencies`
仍是 `^4.0.0` / `^3.18.4`，所以 0.1.7 宿主在运行时依旧可用；类型面按 0.2.2 编译，新字段能提前被
`tsc` 抓到（本次的 `mode` → `status` 就是这样发现的）。

> 0.2.2 的**插件市场**换了形态（与本插件代码无关，但影响分发）：
> 宿主内置了 `pluginMarket` 服务 + Discover 页 + `plugin_market` agent 工具，索引是
> **用户配置的 URL 列表**（`Config.indexes`，默认空）。索引格式是 `format: 1` 的 JSON
> （`@deepseek-ai/dsh-plugin-market-index/types`），每条版本声明 `source`（`npm` 或 `git`+commit）
> 与 `engines.dsh`。旧的第三方 `dshmarket` 仍在 profile 里，但不再是官方入口。
> 本包没有发布到 npm（`@qianluo-ly/dsh-weather` 返回 404），所以若能上架市场，`source` 只能是 git。
>
> 升级路径仍是老规矩：plugin-manager 对已安装的同名包直接 install 会返回 `already-installed`
> （`tools.ts` 原文就写着 “call remove_bundle first, then install_bundle again”），
> 所以「更新」= 先移除再装目标版本；任何会话在跑时第三方市场还可能以 `update-blocked` 拒绝。

## 产物契约

- `lib/index.js`：Host 半侧，Cordis 插件入口（`apply`）。设置注册是**声明式**的：
  模块导出 `Config`（= `WeatherConfigSchema`，字段全部 `.volatile()`），Host 0.1.7
  的设置 provider 把该 entry 的 Config 投影成 settings namespace（ns = profile
  行 id = `dsh-weather`）并通过 `remote.settings` 供给浏览器半侧。
- `lib/client.js`：浏览器半侧，按 DSH 客户端模块系统的 lazy-CJS factory 格式构建：

  ```js
  window.__ModuleLoader__.load({ id: "@qianluo-ly/dsh-weather", factory: (require) => { … return module.exports; } })
  ```

  `id` 必须逐字等于 `package.json` 的 `name`（构建时读取，见 `scripts/build-lib.mjs` 的 `ID`）。
  平台模块（react / react-dom / cordis / ui-slots，见 `PLATFORM_MODULES`）与 `dsh.client.inject`
  声明的行（`INJECT_EDGES`，当前 `@deepseek-ai/dsh-client-ui-settings`）走注入的 `require`，
  其余依赖全部内联。构建脚本 `scripts/build.mjs` 用 esbuild 复刻了仓库
  `packages/client/tsdown.client.ts` 的产物格式。

- **`ctx` 上的服务类型全部来自「类型导入」，而这些导入会在宿主重构时静默失效**：
  `ctx.slots`（`SlotRegistry`）由 `@deepseek-ai/dsh-client-ui-renderer/client` 声明，
  `ctx.configForms` 由 `@deepseek-ai/dsh-client-ui-settings/client` 声明。两者都必须在
  源码里有一条 `import type {} from …` 才能进入编译程序；缺失时 `tsc` 报
  `Property 'slots' does not exist on type 'Context'`。宿主 0.1.7 把旧
  `@deepseek-ai/dsh-client-runtime`（`settingsScope` 时代）换成了 ui-renderer，
  **devDependencies 要跟着换**，否则类型面会整块消失。

### 入口名不变式（改包名前必读）

`cordis.patch.yml` 里 `insert` 的 `name` 必须**逐字等于** `package.json` 的 `name`：

- `pnpm` 按 manifest 名安装依赖，profile 的 `node_modules/<name>` 因此就是 manifest 名（用户手写
  别名时才是别名，例如旧的 `"dsh-weather": "github:…"`）；
- loader 用这个 specifier 从 profile 目录解析入口行，解析失败只在宿主日志里留一条
  `ERR_MODULE_NOT_FOUND`（`Entry._init()` 捕获后 return），**UI 上没有任何提示**；
- 行没挂上 → Host 没有这个 entry，settings namespace 与 client bundle 都不会出现，于是
  chip 与「设置 → 天气」一起消失，插件市场却仍显示安装成功（热挂载只等
  外层 include 激活，子行导入失败会被吞掉）。

改 `package.json` 的 `name` 时，同一提交里必须改 `cordis.patch.yml` 的 `name`；老 profile 里用旧
别名装过的实例要卸载重装（改包名就等于换依赖名）。

## 包结构

```
package.json          # dsh.bundle.patch + dsh.client（platform web, inject ui-settings）
cordis.patch.yml      # 向 profile bundle 层栈插入 dsh-weather 条目（insert 的 name 必须等于 package.json 的 name）
src/index.ts          # Host 半侧：导出 Config（settings 表单来源，字段 .volatile()）
src/config-shared.ts  # 共享配置类型 + 默认值 + 范围常量 + sanitizeConfig（Host 与浏览器共用，浏览器侧内联）
src/client/           # 浏览器半侧
  index.tsx           #   apply：注册 conversation.session.header.actions（天气 chip）+ settings.section（配置页）
  slotmap.d.ts        #   SlotMap 席位声明增强（conversation.session.header.actions）
  ui/                 #   展示层：组件与视觉资源
    WeatherBar.tsx    #     chip + 详情弹层的布局与交互（数据/副作用全部走 hooks）
    panels.tsx        #     弹层纯展示块（stat/rain/hourly/daily/facts/day-detail）
    TrendChart.tsx    #     24h 温度 SVG 折线
    icons.tsx         #     WMO → SVG 图标 + 通用小图标
    theme.ts          #     设计 token / 调色板单一源
    styles.ts         #     注入的少量全局样式
  settings/           #   设置页：页面外壳 + 各分区（本地草稿 + blur 提交校验）
    WeatherSettings.tsx #   页面外壳：分区编排、通知权限、写回与拒绝探针
    shared.tsx        #     表单原语与色板（Row / checkbox / ClockField / inputButton）
    location.tsx      #     定位方式、经纬度、城市搜索
    city-search.tsx   #     中文城市搜索字段
    saved-cities.tsx  #     收藏城市列表管理
    brief.tsx         #     每日简报时间设置
    toggles.tsx       #     显示 / 提醒开关
    units.tsx         #     单位与刷新间隔
    diagnostics.tsx   #     定位诊断面板
  hooks/              #   行为层：副作用与状态
    weather.ts        #     定位 + 位置漂移复检、数据抓取 + 降级、收藏城市、通知、标签页标题、逐日详情
    brief.ts          #     每日简报调度（到点推送、补发窗口、每时段一次）
  data/               #   数据层：抓取、解析、文案
    weather-api.ts    #     公制抓取、超时/取消、IP 共识定位、中文地理编码、逐日详情
    geolocation.ts    #     定位（GPS 优先、IP 兜底）、城市搜索、定位诊断
    location-match.ts #     载荷与当前定位是否同一地点（通知 / 简报防串城市用）
    condition.ts      #     WMO 分类/阈值单一源 + 中文文案 + 时间格式化
    aqi.ts            #     中国 AQI（HJ 633-2012 的 IAQI 分段表与自算，非数据源口径）
    describe.ts       #     天气描述文案与分级（天空/雨雪强度）
    alerts.ts         #     恶劣天气评估（按实测强度分级）
  shared/             #   跨层通用工具
    http.ts           #     带超时/取消的 fetch 封装
    format.ts         #     数值与时间格式化
    units.ts          #     显示单位换算（°F/mph），数据层保持公制
scripts/build.mjs     # esbuild 构建脚本（委托 build-lib.mjs）
scripts/check-lib-sync.mjs  # 校验 lib/ 与 src/ 同步（已接入 npm run check）
scripts/check-encoding.mjs  # 扫描/修复双重编码乱码（UTF-8 被当作 GBK 再存回）
scripts/verify-bundle.cjs   # 产物契约断言（factory 头尾、体积、席位、WeatherBar）
scripts/verify-features.cjs # 功能探针断言（feed 参数、供应商、暗色 token、React 未内联）
scripts/smoke-client.cjs    # 在 vm 里真正跑一遍 factory，校验导出与 inject
scripts/verify-units.cjs    # 单元行为断言（阈值、分级、抓取映射）
scripts/calibrate-cities.cjs # 100 城真实报文自检，自动报异常（npm run probe:cities，需网络）
scripts/probe-live.cjs      # 单城报文探针 + 构造边界场景（npm run probe:live，需网络）
scripts/dust-check.cjs      # 逐时对照 PM10/dust 与能见度，复核数据源字段一致性（npm run probe:dust）
```

探针类脚本**不进 `npm run check`** —— 它们依赖网络与实时天气，是手动体检工具而非关卡。
改描述/阈值规则后，先 `npm run probe:cities` 跑一遍真实数据，再提交。

### 发布包边界

`npm publish` 的内容由 `package.json` 的 `files` 白名单决定，**与 `.gitignore` 是两套互不通气的机制**：被 `.gitignore` 挡在仓库外的文件，只要落在 `files` 列出的目录里，照样会进发布包。`scripts/` 因此**不在白名单内** —— 它是开发工具（构建、验证、探针、个人调试脚本），而使用者只需要 `lib/`（已编译产物）与 `cordis.patch.yml`。改动 `files` 后一律用 `npm pack --dry-run` 实测清单，不要靠读配置推断。

## 校验

```sh
npm run check        # typecheck → check:encoding → build → verify（断言，失败即非零退出）→ check:lib-sync
```

`verify` 里的每个探针都会在失败时 `process.exit(1)`：只会打印的脚本骗得过 CI，
骗不过一次真实的产物损坏。`smoke-client.cjs` 会真正执行 bundle 的 factory，
因此它也是唯一能发现「构建成功但模块导出坏了」的一步。

`lib/` 是提交产物（git 安装无需执行构建脚本），因此**每次改 `src/` 都要重建并提交 `lib/`**；
`check:lib-sync` 会重新构建到临时目录并逐字节比对，漏提交会直接失败。

## 发布与收录

本项目**不发布 npm**，纯 GitHub 分发。

### 官方内置市场（宿主 0.2.2+）

0.2.2 起宿主自带 `pluginMarket` 服务 + Plugins 页的 Discover 标签 + `plugin_market` agent 工具。
索引是**用户自己配置的一组 URL**（`Config.indexes`，默认空），本仓库自带一份 `format: 1` 的索引：

- 文件：`market/index.json` —— **生成物，不要手改**
- 生成：`npm run market:index`（默认 HEAD；`--commit <sha>` 指定某个提交）
- 托管地址（推送到 `main` 后生效）：
  `https://raw.githubusercontent.com/QianLuo-Ly/dsh-weather/main/market/index.json`
- 使用：宿主「设置 → 插件 → Discover」添加该 URL，即可看到本插件并一键安装

索引描述**某个 commit**，版本号、`engines.dsh`、homepage 全部从该 commit 的 `package.json` 读，
而不是工作区——否则会出现「市场写着 0.7.3、装下来的却是 0.7.2」。所以发版顺序固定为：

```sh
# 1. 改代码 / 改版本号，跑门禁
npm run check
# 2. 提交
git add -A && git commit -m "release: 0.7.3"
# 3. 用新提交重生成索引，再提交索引
npm run market:index
git add market/index.json && git commit -m "chore(market): index 0.7.3"
# 4. 推送
git push
```

本包不在 npm 上，索引里的 `source` 只能是 `git`，安装 spec 形如
`git+https://github.com/QianLuo-Ly/dsh-weather.git#<40-hex sha>`（由 `marketInstallTarget` 生成）。
索引格式由宿主校验器把关：`MarketIndexError` 会指出具体 JSON 路径，别靠肉眼猜。

### awesome-dsh-plugin（旧市场）

向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 仓库提 PR，
在 `data/plugins/` 下新增 `QianLuo-Ly__dsh-weather.yml`（草稿见仓库根目录 `.release/`，
那是旧 `dshmarket` 的 `url/name/category` 格式，与 format 1 索引无关）。合并后（约一天内）
出现在第三方 `dshmarket` 的「设置 → 插件市场」。

发布新版本时：改 `package.json` 版本号（如需）、重新 `npm run check`、推送到
`main` 即可——市场与网站按仓库自动同步，无需其他步骤。

> ⚠️ **构建产物 `lib/` 是提交进仓库的**（本项目不发布 npm，也没有 `prepare` 脚本，
> 安装方拿到仓库即有现成的 `lib/`，从而免去 pnpm 的「放行构建脚本」步骤）。
> **每次改 `src/` 后必须重新 `pnpm build` 并把更新的 `lib/` 一起提交**，
> 否则安装方拿到的是旧产物。
