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

## 产物契约

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

## 包结构

```
package.json          # dsh.bundle.patch + dsh.client（platform web, inject ui-settings）
cordis.patch.yml      # 向 profile bundle 层栈插入 dsh-weather 条目
src/index.ts          # Host 半侧：settings namespace 注册（schema 边界与 config-shared 共享）
src/config-shared.ts  # 共享配置类型 + 默认值 + 范围常量 + sanitizeConfig（Host 与浏览器共用，浏览器侧内联）
src/dsh-settings.d.ts # 本地 ctx.settings 类型 shim（见文件内注释）
src/client/           # 浏览器半侧
  index.tsx           #   apply：注册 conversation.session.header.actions（天气 chip）+ settings.section（配置页）
  WeatherBar.tsx      #   chip + 详情弹层主组件（数据生命周期 / 交互）
  panels.tsx          #   弹层纯展示块（stat/rain/hourly/daily/facts）
  WeatherSettings.tsx #   设置页表单（本地草稿 + blur 提交校验）
  weather-api.ts      #   数据层：公制抓取、超时/取消、IP 共识定位、中文地理编码、告警评估
  condition.ts        #   WMO 分类/阈值单一源 + 中文文案 + 时间格式化
  units.ts            #   显示单位换算（°F/mph），数据层保持公制
  theme.ts            #   设计 token / 调色板单一源
  styles.ts           #   注入的少量全局样式
  icons.tsx           #   WMO → SVG 图标 + 通用小图标
  TrendChart.tsx      #   24h 温度 SVG 折线
scripts/build.mjs     # esbuild 构建脚本（委托 build-lib.mjs）
scripts/check-lib-sync.mjs  # 校验 lib/ 与 src/ 同步
```

## 发布与收录

本项目**不发布 npm**，纯 GitHub 收录：向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
仓库提 PR，在 `data/plugins/` 下新增 `QianLuo-Ly__dsh-weather.yml`（草稿见本目录
`.release/`）。合并后（约一天内）自动出现在 dsh-market 的「设置 → 插件市场」。

发布新版本时：改 `package.json` 版本号（如需）、重新 `npm run check`、推送到
`main` 即可——市场与网站按仓库自动同步，无需其他步骤。

> ⚠️ **构建产物 `lib/` 是提交进仓库的**（本项目不发布 npm，也没有 `prepare` 脚本，
> 安装方拿到仓库即有现成的 `lib/`，从而免去 pnpm 的「放行构建脚本」步骤）。
> **每次改 `src/` 后必须重新 `pnpm build` 并把更新的 `lib/` 一起提交**，
> 否则安装方拿到的是旧产物。
