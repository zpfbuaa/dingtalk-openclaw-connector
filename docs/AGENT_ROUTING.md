# Agent 路由与 SessionKey 规范

本文档是 DingTalk OpenClaw Connector 中 **Agent 路由（bindings）** 和 **SessionKey 构建** 的完整开发规范，供新功能开发和代码审查参考。

---

## 一、核心概念：两个职责分离的字段

`buildSessionContext()` 返回的 `SessionContext` 包含两个 peer 标识字段，**职责严格分离，不能混用**：

| 字段 | 职责 | 受配置影响 |
|------|------|-----------|
| `peerId` | **路由匹配专用**，始终是真实的 peer 标识（群聊为 `conversationId`，单聊为 `senderId`） | ❌ 不受任何会话隔离配置影响 |
| `sessionPeerId` | **session/memory 隔离键**，用于构建 `sessionKey` | ✅ 受 `sharedMemoryAcrossConversations`、`separateSessionByConversation`、`groupSessionScope` 影响 |

**核心原则**：
- **路由匹配（去哪个 Agent）** → 使用 `peerId`
- **session 隔离（共享多大范围的上下文）** → 使用 `sessionPeerId`

---

## 二、Agent 路由规则（Bindings）

### 2.1 路由流程

每条钉钉消息到达后，connector 按以下顺序确定目标 Agent：

```
消息到达
  ↓
buildSessionContext()        ← 构建会话上下文（含 peerId / sessionPeerId）
  ↓
遍历 cfg.bindings[]          ← 按顺序逐条匹配，使用 peerId 进行匹配
  ↓ 命中第一条
matchedAgentId               ← 使用该 agentId
  ↓ 全部未命中
cfg.defaultAgent || 'main'   ← 回退到默认 Agent
```

### 2.2 Binding 匹配字段

每条 binding 的 `match` 字段支持以下维度，**所有指定的维度必须同时满足**（AND 关系）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `match.channel` | `string?` | 频道名，固定为 `"dingtalk-connector"`，省略则匹配所有频道 |
| `match.accountId` | `string?` | 钉钉账号 ID（对应 `accounts` 配置中的 key），省略则匹配所有账号 |
| `match.peer.kind` | `"direct" \| "group"?` | 会话类型，省略则匹配单聊和群聊 |
| `match.peer.id` | `string?` | Peer 标识，群聊为 `conversationId`，单聊为 `senderId`，`"*"` 表示通配所有 |

### 2.3 匹配逻辑

```typescript
for (const binding of cfg.bindings) {
  const match = binding.match;
  if (match.channel && match.channel !== 'dingtalk-connector') continue;
  if (match.accountId && match.accountId !== accountId) continue;
  if (match.peer) {
    if (match.peer.kind && match.peer.kind !== sessionContext.chatType) continue;
    // 使用 peerId（真实 peer 标识），不受会话隔离配置影响
    if (match.peer.id && match.peer.id !== '*' && match.peer.id !== sessionContext.peerId) continue;
  }
  matchedAgentId = binding.agentId;
  break;
}
if (!matchedAgentId) {
  matchedAgentId = cfg.defaultAgent || 'main';
}
```

### 2.4 优先级规则

- **顺序优先**：bindings 数组按顺序遍历，**第一条命中的规则生效**，后续规则不再检查
- **精确规则放前面**：将指定了 `peer.id` 的精确规则放在通配规则（`peer.id: "*"`）之前，避免通配规则提前拦截

### 2.5 典型配置示例

**多群分配不同 Agent**：

```json
{
  "bindings": [
    {
      "agentId": "main",
      "match": {
        "channel": "dingtalk-connector",
        "accountId": "groupbot",
        "peer": { "kind": "group", "id": "cid3RKewszsVbXZYCYmbybVNw==" }
      }
    },
    {
      "agentId": "organizer",
      "match": {
        "channel": "dingtalk-connector",
        "accountId": "groupbot",
        "peer": { "kind": "group", "id": "cidqO7Ne7e+myoRu67AguW+HQ==" }
      }
    },
    {
      "agentId": "atlas",
      "match": {
        "channel": "dingtalk-connector",
        "accountId": "groupbot",
        "peer": { "kind": "group", "id": "cidekzhmRmaKaJ6vnQezRFZWA==" }
      }
    }
  ]
}
```

**单聊走一个 Agent，群聊走另一个**：

```json
{
  "bindings": [
    {
      "agentId": "personal-assistant",
      "match": { "channel": "dingtalk-connector", "peer": { "kind": "direct" } }
    },
    {
      "agentId": "group-bot",
      "match": { "channel": "dingtalk-connector", "peer": { "kind": "group" } }
    }
  ]
}
```

**精确路由 + 通配兜底**：

```json
{
  "bindings": [
    {
      "agentId": "vip-agent",
      "match": { "channel": "dingtalk-connector", "peer": { "kind": "group", "id": "cidVIP..." } }
    },
    {
      "agentId": "main",
      "match": { "channel": "dingtalk-connector", "peer": { "kind": "group", "id": "*" } }
    }
  ]
}
```

---

## 三、SessionKey 构建规范

### 3.1 SessionKey 格式

```
agent:{agentId}:{channel}:{peerKind}:{sessionPeerId}
```

示例：
- `agent:main:dingtalk-connector:direct:manager7195`（默认单聊，按用户隔离）
- `agent:main:dingtalk-connector:group:cid3RKewszsVbXZYCYmbybVNw==`（默认群聊，按群隔离）
- `agent:main:dingtalk-connector:direct:bot1`（`sharedMemoryAcrossConversations=true`，所有会话共享）

### 3.2 sessionPeerId 的取值规则

`sessionPeerId` 由 `buildSessionContext()` 根据配置决定，控制 session/memory 的隔离粒度：

| 配置 | 适用场景 | `sessionPeerId` 取值 | 效果 |
|------|---------|---------------------|------|
| `sharedMemoryAcrossConversations: true` | 所有会话共享记忆 | `accountId` | 单聊、群聊全部共享同一 session |
| `separateSessionByConversation: false` | 按用户维度隔离，不区分群/单聊 | `senderId` | 同一用户在不同群的消息共享 session |
| `groupSessionScope: "group_sender"` | 群内每个用户独立 session | `${conversationId}:${senderId}` | 同群不同用户各自独立 |
| 默认（群聊） | 整个群共享一个 session | `conversationId` | 群内所有用户共享 session |
| 默认（单聊） | 每个用户独立 session | `senderId` | 每个用户独立 session |

> **注意**：`sharedMemoryAcrossConversations: true` 是全局开关，会同时影响单聊和群聊。如果只想让群聊共享记忆而单聊按用户隔离，该配置无法满足，需要在业务层自行处理。

### 3.3 SessionKey 构建代码规范

在 `message-handler.ts` 中，sessionKey 通过 SDK 标准方法构建，**必须使用 `sessionContext.sessionPeerId`**：

```typescript
const dmScope = cfg.session?.dmScope || 'per-channel-peer';
const sessionKey = core.channel.routing.buildAgentSessionKey({
  agentId: matchedAgentId,
  channel: 'dingtalk-connector',
  accountId: accountId,
  peer: {
    kind: sessionContext.chatType,
    id: sessionContext.sessionPeerId,  // ✅ 使用 sessionPeerId，不是 peerId
  },
  dmScope: dmScope,
});
```

**禁止**：
- 用 `sessionContext.peerId` 构建 sessionKey（peerId 是路由匹配专用，不受会话隔离配置影响）
- 手动拼接 sessionKey 字符串（必须通过 SDK 的 `buildAgentSessionKey` 方法）

### 3.4 消息队列 Key 规范

消息队列 key（`queueKey`）用于控制同一会话内的消息串行处理，**必须与 sessionKey 使用相同的 `sessionPeerId`**，确保隔离策略一致：

```typescript
const baseSessionId = sessionContext.sessionPeerId;
const queueKey = `${baseSessionId}:${matchedAgentId}`;
```

---

## 四、配置参数速查

### 4.1 会话隔离相关配置

| 配置字段 | 类型 | 默认值 | 说明 |
|---------|------|--------|------|
| `sharedMemoryAcrossConversations` | `boolean` | `false` | 所有会话（单聊+群聊）共享同一记忆 |
| `separateSessionByConversation` | `boolean` | `true` | 是否按会话（群/单聊）区分 session；`false` 时按用户维度 |
| `groupSessionScope` | `"group" \| "group_sender"` | `"group"` | 群聊 session 粒度；`group_sender` 时群内每人独立 |
| `session.dmScope` | `string` | `"per-channel-peer"` | 传递给 SDK 的 dmScope 参数，影响 sessionKey 格式 |

### 4.2 路由相关配置

| 配置字段 | 类型 | 说明 |
|---------|------|------|
| `bindings` | `Binding[]` | Agent 路由规则列表，按顺序匹配 |
| `defaultAgent` | `string` | 未命中任何 binding 时的默认 Agent，默认为 `"main"` |

---

## 五、开发规范总结

1. **路由匹配用 `peerId`**：`match.peer.id` 与 `sessionContext.peerId` 比较，`peerId` 始终是真实的 `conversationId`（群）或 `senderId`（单聊），不受任何会话隔离配置影响。

2. **session 构建用 `sessionPeerId`**：`sessionKey` 和 `queueKey` 的构建均使用 `sessionContext.sessionPeerId`，受会话隔离配置影响，决定记忆/上下文的共享范围。

3. **两者职责严格分离**：路由（去哪个 Agent）和记忆隔离（共享多大范围的上下文）是两个独立维度，代码中不能用同一个字段同时承担两种职责。

4. **sessionKey 必须通过 SDK 构建**：使用 `core.channel.routing.buildAgentSessionKey()`，不要手动拼接字符串。

5. **bindings 顺序即优先级**：精确规则（指定 `peer.id`）必须放在通配规则（`peer.id: "*"`）之前。
