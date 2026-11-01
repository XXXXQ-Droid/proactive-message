# 使用说明 · 主动发消息插件（qq-bridge）

> 本插件是 **qq-bridge（桥）的插件**，不是 DSH 插件。
> 它由桥进程加载，因此**只在桥运行时工作**；装进 DSH 不会生效，也不会出现在 DSH 插件市场。

---

## 一、它工作在整条链路的哪一层

```
QQ 客户端
   │
   ▼
OneBot 网关（如 SnowLuma，HTTP + WebSocket）
   │
   ▼
qq-bridge（桥，提供控制台与工具）   ◄── ★ 本插件挂在这一层
   │
   ▼
DSH（DeepSeek Harness）上的 Agent
```

| 组件 | 职责 | 备注 |
|---|---|---|
| QQ 客户端 | 登录账号、收发消息 | 任意支持 OneBot v11 的方案 |
| OneBot 网关 | 把 QQ 协议翻译成 OneBot v11 | 如 SnowLuma；HTTP 与 WS 各一个端口 |
| **qq-bridge（桥）** | 会话映射、权限、工具暴露、定时提醒 | 本插件的宿主 |
| DSH | 真正跑模型的宿主 | 通过桥注入的会话令牌调用工具 |

**结论**：插件挂在桥这一层，所以

1. 安装方式是**改桥的代码/配置**并在桥里 import，而不是在 DSH 里装包；
2. **桥停即停**——这就是「只有把机器人接起来的时候才运行」的实现方式，不需要额外的开关。

---

## 二、它做什么

每隔 N 分钟（默认 120），桥向 Agent 的 DSH 会话投递一条**后台提醒**（不走 QQ 消息，不打扰任何人）：

> 【主动提醒】现在轮到你决定要不要主动做点什么，不做也完全没问题：
> · 想不想主动找个人聊两句？可以发给：群 …；好友 …。内容你自己定……
> · 想不想发条空间说说？
> · 你当前所在会话：`private:<ownerQQ>`
> · 【会话令牌】`<agent token>`
> 不想做就什么都不用做，无视这条提醒即可。

Agent 收到后：

- **想发** → 自己调用发送类工具（如 `qq_send_message`）或空间类工具（如 `qq_post_qzone`），目标与内容自定；
- **不想发** → 这一轮直接结束。

> 提醒里为什么带令牌：发送类工具需要鉴权，缺少令牌时 Agent 只能看到提醒却无法发送。

---

## 三、安装步骤

### 1. 放置文件

把本目录放到桥的插件目录下，例如：

```
qq-bridge/
└─ plugins/
   └─ proactive-message/
      ├─ index.js
      ├─ package.json
      ├─ settings.html
      ├─ config.example.json
      ├─ README.md
      └─ USAGE.zh-CN.md
```

### 2. 在桥里 import

编辑 `src/bridge.js` 顶部：

```js
import { createProactivePlugin } from '../plugins/proactive-message/index.js';
```

> 若插件放在桥目录之外，请使用 `file:///` 绝对 URL，并对中文路径做 URL 编码。

### 3. 创建实例并启动

在 `main()` 中（注意顺序：**先创建实例，再调用 `start()`**）：

```js
const proactivePlugin = createProactivePlugin({
  getConfig: () => ({ ...(cfg.proactivePlugin || {}), allow: cfg.allow, ownerQQ: cfg.ownerQQ }),
  deliverPrompt: (key, text) => deliverPrompt(key, text, {}),
  getAgentToken: (key) => String(getSocialV2State(key)?.agentToken || ''),
  readState: readProactiveState,
  writeState: writeProactiveState,
  log,
  appendActivity
});
proactivePlugin.start();
```

> 若 `start()` 写在实例创建之前，启动会抛 `Cannot access 'proactivePlugin' before initialization`。

### 4. 写入配置

在桥的 `config.json` 中加入 `proactivePlugin` 段（样例见 `config.example.json`）。

### 5. 挂载设置页

把 `settings.html` 挂到桥控制台的任意路径，例如：

```js
if (req.method === 'GET' && url.pathname === '/plugin/proactive') {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(path.join(ROOT, 'plugins', 'proactive-message', 'settings.html'), 'utf8'));
  return;
}
```

### 6. 重启桥

加载成功的日志形如：

```
[proactive] plugin loaded v1.0.0 (enabled=true, interval=120min, window=9-23)
```

---

## 四、使用方式

### A. 设置页

打开桥控制台提供的页面（需带控制台令牌）：

```
http://<bridge-host>:<bridge-port>/plugin/proactive?token=<consoleToken>
```

可调整：启用开关、间隔、起止时段、是否带空间提醒、提醒投递目标；并提供「立即触发一次」。

### B. HTTP 接口（均需控制台令牌）

```http
GET  /api/plugin/proactive?token=<consoleToken>

POST /api/plugin/proactive?token=<consoleToken>
Content-Type: application/json

{ "enabled": true, "intervalMinutes": 120, "startHour": 9, "endHour": 23, "includeQzone": true }

POST /api/plugin/proactive/run?token=<consoleToken>
Content-Type: application/json

{}
```

> `/run` 必须携带 JSON 请求体（哪怕只是 `{}`），否则桥的请求校验会返回 415。

### 配置项

| 字段 | 含义 | 默认 | 范围 |
|---|---|---|---|
| `enabled` | 是否启用 | `false` | 布尔 |
| `intervalMinutes` | 提醒间隔（分钟） | `120` | 10–720 |
| `startHour` | 生效起始小时（含） | `9` | 0–23 |
| `endHour` | 生效结束小时（不含） | `23` | 1–24 |
| `includeQzone` | 是否同时提醒发空间 | `true` | 布尔 |
| `targetKey` | 提醒投递给哪个会话 | 空 = `private:<ownerQQ>` | `private:<id>` / `group:<id>` |

---

## 五、运行时行为

- 每 60 秒检查一次是否到达间隔；到点且处于生效时段才触发；
- **仅在桥进程存活期间运行**，桥停止后定时器随之消失；
- 生效时段之外不会触发（默认 9:00–23:00）；
- 提醒中列出的目标取自桥的 `allow.groups` / `allow.private`；为空时提示「白名单为空=全部」；
- 不限制 Agent 的发送条数与对象，只负责提醒一次；
- 运行状态写入 `state/proactive-plugin.json`：

```json
{ "lastRunAt": 1793512345678, "lastReason": "timer" }
```

---

## 六、常见问题

**设置页返回 401 / 空白**
URL 中的 `token` 必须是桥控制台令牌（通常存于 `state/console-token`）。

**日志显示已投递，但 Agent 没有动作**
可能有两种情况：① Agent 判断当前不需要发送（设计允许）；② DSH 会话正忙，提醒被排队。

**桥启动失败：找不到模块**
插件目录被移动或改名；请修正 `import` 路径（中文路径需 URL 编码）。

**桥启动失败：`Cannot access 'proactivePlugin' before initialization`**
`start()` 调用写在了实例创建之前，调整顺序即可。

**如何彻底关闭**
设置页取消启用，或将 `config.json` 中的 `proactivePlugin.enabled` 设为 `false` 后重启桥。

**Token 消耗**
每次提醒等于一次完整的模型调用，单轮约 3–8k token；按每天 12 次计算约 4–10 万 token/天。
Agent 实际发送消息时，每次会多出 1–2 轮工具调用。

**与系统计划任务方案的区别**
系统计划任务通过 HTTP 定时调用桥；本插件把定时器放进桥进程内，优点是「桥停即停、重启自恢复、配置集中在一处」。

---

## 七、文件说明

| 文件 | 用途 |
|---|---|
| `index.js` | 插件主体（ESM，依赖由桥注入） |
| `package.json` | 插件元数据 |
| `settings.html` | 设置页 |
| `README.md` | 英文速查 |
| `USAGE.zh-CN.md` | 本文件 |
| `config.example.json` | 配置样例 |
