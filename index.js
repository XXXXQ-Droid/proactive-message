// 主动发消息 —— qq-bridge 插件（ESM 模块）
//
// 作用：每隔 N 分钟向 Agent 的会话投一条后台提醒，问它要不要主动找人聊天 /
// 要不要发空间动态。想发就发，不想发就无视。只在桥进程活着时运行。
//
// 使用方式（由 bridge.js 注入依赖）：
//   const plugin = createProactivePlugin({ getConfig, deliverPrompt, getAgentToken, readState, writeState, log, appendActivity });
//   plugin.start();               // 启动定时器
//   await plugin.run('manual');   // 立刻触发一次
//
// 依赖全部由宿主注入，插件本身不碰文件系统以外的状态。

export const PLUGIN_NAME = 'proactive-message';
export const PLUGIN_VERSION = '1.1.0';

/** 构造提醒文案（纯函数，便于测试）。 */
export function buildProactivePrompt(config = {}, key = '', token = '') {
  const lines = [
    '【主动提醒】现在是你自己的时间，决定要不要做下面两件事（内容全部由你自己定）：',
    '① 向好友或群主动发条消息（任何好友、任何群都可以，不用看白名单）；',
    '② 发一条空间说说（想刷好友动态、点赞评论也可以）。',
    '规则：',
    '· 两件都不想做 → 什么都不用做，本轮结束，算完成。',
    '· 只想做一件 → 你自己挑一件做。',
    '· 两件都做 → 必须先发说说/空间，再发消息。',
    '做完或决定不做之后，不要复述这条提醒，也不要把令牌发出去。'
  ];
  if (key) lines.push(`· 你当前所在会话：${key}`);
  if (token) lines.push(`· 【会话令牌】${token}`);
  return lines.join('\n');
}

export function createProactivePlugin(deps) {
  const {
    getConfig,
    deliverPrompt,
    getAgentToken = () => '',
    readState = () => ({}),
    writeState = () => {},
    log = () => {},
    appendActivity = () => {}
  } = deps || {};

  let timer = null;

  function targetKeyOf(config) {
    return String(config.targetKey || `private:${config.ownerQQ ?? ''}`);
  }

  async function run(reason = 'timer') {
    const config = getConfig() || {};
    const key = targetKeyOf(config);
    if (!key || key === 'private:') {
      log('[proactive] 跳过：没有 ownerQQ，也没有配置 targetKey');
      return { ok: false, error: '没有可用目标会话' };
    }
    try {
      const token = String(getAgentToken(key) || '');
      const text = buildProactivePrompt(config, key, token);
      const result = await deliverPrompt(key, text);
      if (result && result.ok === false) {
        log(`[proactive] 投递失败 ${key}：${result.error ?? ''}`);
        return { ok: false, error: result.error ?? '投递失败' };
      }
      const st = readState() || {};
      st.lastRunAt = Date.now();
      st.lastReason = reason;
      writeState(st);
      log(`[proactive] 已向 ${key} 投递主动提醒（${reason}）`);
      appendActivity(`${key} [proactive] 主动提醒已投递（${reason}）`);
      return { ok: true, key };
    } catch (error) {
      log(`[proactive] 异常：${error?.message ?? error}`);
      return { ok: false, error: String(error?.message ?? error) };
    }
  }

  async function tick() {
    const config = getConfig() || {};
    if (!config.enabled) return;
    const hour = new Date().getHours();
    const start = Number(config.startHour ?? 9);
    const end = Number(config.endHour ?? 23);
    if (hour < start || hour >= end) return; // 默认 0-24：桥在跑就是工作窗口
    const st = readState() || {};
    const intervalMs = Number(config.intervalMinutes || 120) * 60 * 1000;
    if (Date.now() - (Number(st.lastRunAt) || 0) < intervalMs) return;
    await run('timer');
  }

  function start() {
    if (timer) return;
    setTimeout(() => { void tick(); }, 30000).unref?.();
    timer = setInterval(() => { void tick(); }, 60 * 1000);
    timer.unref?.();
    const config = getConfig() || {};
    log(`[proactive] 插件已加载 v${PLUGIN_VERSION}（enabled=${config.enabled === true}, 间隔=${config.intervalMinutes} 分钟, 时段=${config.startHour}-${config.endHour} 点）`);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { start, stop, run, buildPrompt: buildProactivePrompt, name: PLUGIN_NAME, version: PLUGIN_VERSION };
}
