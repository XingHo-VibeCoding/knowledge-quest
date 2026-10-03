# 余力加练：`cloudbase/functions/api/index.js` 逐段讲解

> 按教材附录 B「AI 可以直接做」的范围整理，供被老师/同学问起时能讲清每一部分。

## 第 1 段：常量与登记表

```js
const SERVICE = 'knowledge-quest';
const REGISTERED_BUT_NOT_IMPLEMENTED = new Set([...]);
```

- `SERVICE`：健康检查返回体里的服务名，证明「回应你的是我刚部署的这个程序」。
- `REGISTERED_BUT_NOT_IMPLEMENTED`：**契约的代码化**——api-contract.md 里登记了但还没实现到哪个天的接口清单。它让代码自己回答"这个接口为什么还 501"，文档和代码不会各说各话。

## 第 2 段：两个工具函数

```js
function json(statusCode, obj)        // 把对象包成云接入要求的返回形状
function fail(statusCode, code, message)  // 统一错误形状 {ok:false,error:{code,message}}
```

- 云接入（HTTP 访问服务）要求云函数返回 `{ statusCode, headers, body }`，`json()` 就是把业务数据翻译成这个形状的唯一出口。
- `fail()` 保证**全项目错误长相一致**——这正是 api-contract.md 通用约定那一节的代码版，前端拿到任何错误都能按同一个结构解析。

## 第 3 段：health 处理器

```js
function health() {
  return json(200, { ok: true, service: SERVICE, time: new Date().toISOString() });
}
```

- 故意**不连数据库、不读任何东西**：它证明的只是"AI 写的代码 → 部署 → 公网可达"这条链路本身。
- `time` 每次请求都变：用来区分"真的是新请求"和"缓存页"。

## 第 4 段：入口 `exports.main`

```js
const method = (event.httpMethod || 'GET').toUpperCase();
let path = event.path || '/';
const i = path.indexOf('/api/');
path = i >= 0 ? path.slice(i) : path;
```

- 云接入把 HTTP 请求翻译成 event（含 path、httpMethod、headers、body），入口先取出方法与路径。
- `indexOf('/api/')` 截取：公网域名可能带环境前缀（网关加的），只认 `/api` 开头那段，路由才稳。

## 第 5 段：路由分发（三档）

```js
if (path === '/api/health' && method === 'GET') return health();
// 归一化 /api/cards/3 → /api/cards 后比对登记表 → 501
return fail(404, 'ROUTE_NOT_FOUND', ...);
```

三档语义分得很清，这也是 HTTP 的规矩：

| 档 | 条件 | 返回 |
|---|---|---|
| 已实现 | health + GET | 200 业务响应 |
| 已登记未实现 | 路径在契约里但还没到实现日 | **501**（不是我忘了，是计划如此） |
| 没登记 | 契约里根本没有 | 404（真的不存在） |

- 归一化那几行：`/api/cards/3` 这类带 id 的路径先砍掉 id 再比对，这样 Day 22 的 `DELETE /api/cards/:id` 也能命中登记表。

## 第 6 段：兜底 try/catch

```js
} catch (e) {
  return fail(500, 'INTERNAL_ERROR', ...);
}
```

任何没料到的异常也按契约的错误形状返回，而不是让网关吐一个 HTML 错误页——前端永远拿得到可解析的 JSON。

## 一句话总结（口述版）

> 这个云函数现在是"半张合同"：health 是唯一真实现，其余接口全部按 api-contract.md 登记，访问它们会得到统一的 501 错误形状。等 Day 16-22 建好表，就是把 501 逐个换成真实现的过程，路由和错误格式一行都不用改。
