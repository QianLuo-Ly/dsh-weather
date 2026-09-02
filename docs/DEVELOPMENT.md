# 开发指南

面向想要构建、调试或二次开发 dsh-weather 的开发者。

## 环境与构建

```sh
pnpm install     # 安装 devDependencies
pnpm typecheck   # tsc 类型检查
pnpm build       # 产出 lib/index.js（Host）+ lib/client.js（浏览器 bundle）
```

## 本地开发安装

```sh
# 在插件目录构建
pnpm install && pnpm build

# 装进 web profile（等同插件市场的一键安装流程：写依赖 + 加入 bundle 层栈）
cd <deepseek-harness-checkout>
pnpm dsh plugin --profile web add D:\path\to\dsh-weather
```

重启 `dsh web`，刷新页面即可看到顶部天气栏。

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

## 发布

发布前先 `npm run check`（typecheck + build），确认产物最新，然后 `npm publish`。
