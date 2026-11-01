# Proactive Message · qq-bridge Plugin

A scheduling plugin for **qq-bridge**: periodically nudges your agent to consider
**sending a message to someone on its own** or **posting to Qzone** — and lets it
decide freely whether to act.

- Wants to send → it picks a target from the allow-list and writes the content itself.
- Doesn't want to → it simply ignores the nudge. Nothing happens, no explanation needed.

> Full installation / usage / troubleshooting: **[USAGE.zh-CN.md](./USAGE.zh-CN.md)**.
> This file is the quick reference.

## How it fits

```
QQ client ──► OneBot gateway (e.g. SnowLuma) ──► qq-bridge ──► DSH agent
                                                    ▲
                                        this plugin runs here
```

This is a **qq-bridge plugin**, not a DSH plugin:

- It is loaded by the bridge process, so it **only runs while the bridge runs**.
- It does **not** appear in the DSH plugin marketplace, and installing it into DSH has no effect.

## Features

- **Runs only with the bridge** — stop the bridge and the timer is gone.
- **Built-in settings page** — served by the bridge console at `/plugin/proactive`.
- **Allow-list based targets** — the nudge lists the bridge's `allow.groups` / `allow.private`.
- **No coercion** — one nudge, then the agent decides how many messages to send and to whom.
- **Optional Qzone prompt** — disable it if you don't want Qzone suggestions.
- **Quiet hours** — configurable active window, no nudges at night.

## Install

1. Copy this directory into your bridge checkout, e.g. `qq-bridge/plugins/proactive-message/`.
2. Import it in `src/bridge.js`:

   ```js
   import { createProactivePlugin } from '../plugins/proactive-message/index.js';
   ```

3. Create the instance in `main()`, then start it:

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

4. Add the config block to `config.json` (see `config.example.json`).
5. Serve `settings.html` at `/plugin/proactive` (or your own path).
6. Restart the bridge. You should see:

   ```
   [proactive] plugin loaded v1.0.0 (enabled=true, interval=120min, window=9-23)
   ```

## Configuration

| Key | Meaning | Default | Range |
|---|---|---|---|
| `enabled` | Enable the plugin | `false` | boolean |
| `intervalMinutes` | Nudge interval in minutes | `120` | 10–720 |
| `startHour` | Active window start (inclusive) | `9` | 0–23 |
| `endHour` | Active window end (exclusive) | `23` | 1–24 |
| `includeQzone` | Also suggest posting to Qzone | `true` | boolean |
| `targetKey` | Conversation the nudge is delivered to | `""` = `private:<ownerQQ>` | `private:<id>` / `group:<id>` |

## HTTP API (bridge console, requires console token)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/plugin/proactive` | Read config + last run time |
| `POST` | `/api/plugin/proactive` | Update config |
| `POST` | `/api/plugin/proactive/run` | Trigger once now (body must be JSON, e.g. `{}`) |

## Notes

- The nudge includes the current conversation key and token so the agent can actually use its
  send tools; without them it can only read the nudge.
- State is persisted in `state/proactive-plugin.json`.

## License

MIT
