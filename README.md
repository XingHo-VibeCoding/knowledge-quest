# 知识闯关（knowledge-quest）

> 把知识存成卡片，复习时就是一场游戏。

一个面向学生（也面向在培训机构边工作边学习的我）的个人学习成长工具：平时把要记的知识点存成「知识卡片」，复习时卡片变成闯关小游戏，答对集章、记牢固。后续还会长出「今日任务规划」和「口语跟读打卡」两个模式。

## 本地运行

```bash
cd knowledge-quest
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

> 不要用 file:// 直接打开——浏览器同源策略会拦掉 fetch。

## 当前进度


- **用户反馈轮（2026-10-03）**：①视觉翻新 v2——头部深靛蓝渐变+品牌色光斑+底部大圆角，「＋ 添加卡片」升级为白底主 CTA，卡片 16px 圆角+双层柔影+hover 品牌色上浮，按钮渐变+投影，全局统一 --radius/--shadow token，`prefers-reduced-motion` 降级；②**两级分类上线**——卡片带 `sub` 子分类字段，选科目后第二行出子分类 chips（带数量角标），「⚙ 管理分类」面板可加子类/删空子类（有卡的子类拒绝删除并提示数量），配置存 localStorage 刷新不丢，表单科目→子分类联动（含自定义），URL 支持 `&sub=` 直达；CDP 十路径测试 10/10，Day 12/13 回归全过，对比度 72 对 FAIL 0
- **Day 15**：打通云端链路——产出 [api-contract.md](api-contract.md) 接口契约（页面动作→接口对照表 + `cards` / `quiz_records` 两表数据模型 + 7 个接口全登记含响应/错误形状，本周唯一仲裁物）；`cloudbase/functions/api/` 云函数实现 `GET /api/health`（不连数据库，未实现接口按契约返回 501，本地路由单测 7/7）；部署清单见 [docs/day15-cloudbase-setup.md](docs/day15-cloudbase-setup.md)（注册/授权/发布由学员本人按附录 M 操作）
- **Day 14（第 2 周周验证日）**：轻量用户测试——预演走查（375px 真机视口量化 57 个可点元素）发现「详情 ›」入口仅 39×20px、低于 44px 触屏最小点击目标且紧邻翻面热区；最小修复为 309×44px 通栏按钮后超小目标 33→9，Day 11/12/13 全部旧测试回归通过；同伴测试话术与记录表见 [docs/day14-usability-test.md](docs/day14-usability-test.md)，第 2 周周验证材料见 [docs/week2-verification.md](docs/week2-verification.md)
- **Day 13**：三视图地址路由 + 四状态——`#/wall`、`#/quiz`、`#/card/<id>` 全部可独立访问（可分享、可刷新、前进后退可用）；新增**卡片详情页**（面包屑 + 同科目卡片 + 找不到的边界态）构成「列表 → 详情」多级页面；列表四态齐备且支持 `?demo=` 常驻演示；导航升级为真链接 + `aria-current`，卡片支持键盘翻面；CDP 十三路径测试全过
- **Day 12**：项目内 Skill（`.workbuddy/skills/kq-frontend-audit/`：SKILL.md + 对比度复算脚本 + 可访问性脚本 + 调用记录）并真实调用——修改前复算揪出 7 处存量对比度不达标、可访问性脚本揪出表单缺标签、截图揪出 `.hidden` 被 toast 反杀的 Day 11 遗留 bug；关键词 + 科目组合筛选上线（有结果 / 无结果 / 清空恢复三态，筛选条件写入 URL 可直达）
- **Day 10**：截图+自然语言定位修复——闯关提示文案与真实交互对齐（「翻面核对」→「点下方按钮核对」），CDP 设备仿真实测 375px 无溢出
- **Day 11**：删除卡片交互补全状态反馈——处理中禁用防重复提交、成功 toast + 5 秒撤销、失败原地提示下一步；三路径（正常/重复/失败）CDP 自动化测试全过
- **Day 9**：设计规则审查修复（筛选chips对比度 / 次要文字 WCAG AA / 表单对齐 / 间距，前后截图对比）+ `--ink-*` 颜色 token 约束；闯关模式雏形（抽 5 关 → 自答 → 翻面核对 → 自判 → 成绩单 + 本机最佳战绩）+ 添加卡片（localStorage 本机持久化，自存卡可删、参与闯关）
- **Day 8**：主视图（mock 数据版）——知识卡片墙 + 科目筛选 + 随机复习 + 点击翻面；四种页面状态（加载/空/错误/正常）齐备
- 旧项目「今日热搜」（jinri-hot-search）保留作为存档，Day 8 起主线切换到本项目

## 页面路径与状态表（Day 13）

三个视图都是「地址认视图」：把地址粘给任何人，打开就是同一个页面；浏览器的前进 / 后退也按地址工作。

| 视图 | 路径 | 承担的任务 |
|---|---|---|
| 卡片墙 | `#/wall`（可带 `?q=关键词&subject=科目`） | 浏览 / 搜索 / 筛选全部卡片，是默认首页 |
| 闯关 | `#/quiz` | 抽 5 关答题、自判、出成绩单 |
| 卡片详情 | `#/card/<卡片编号>` | 看一张卡的完整内容 + 同科目卡片，多级页面的第二级 |

列表（卡片墙）的四种状态及触发方式：

| 状态 | 什么时候出现 | 用户看到什么 | 主动演示 |
|---|---|---|---|
| 加载中 | 请求 `quest-cards.json` 期间 | 骨架屏占位 | `#/wall?demo=loading` |
| 加载成功 | 数据正常返回 | 卡片网格 + 统计行 | `#/wall` |
| 空 | 卡片库一张卡都没有 | 「这里还没有任何知识卡片」+ 引导去添加 | `#/wall?demo=empty` |
| 加载失败 | fetch 失败（HTTP 非 200 / 断网） | 错误条 + 「重试」按钮 | `#/wall?demo=error` |

> 另有第 5 种「筛选无结果」态（Day 12）：有卡片但筛选条件一个都匹配不上时，提示「没有找到相关内容」+ 一键清除筛选——它和「空」是两件事，文案和出口都不同。
> `demo` 参数只是把状态常驻出来给验收 / 截图用，不给参数时一切按真实数据走。

## 技术栈

纯 HTML / CSS / JavaScript（原生，无框架）+ 本地 JSON mock 数据；第 3 周起接真实 API。

## 文档链

- [research.md](research.md) — 选题调研：为什么换掉热搜
- [PRD.md](PRD.md) — 产品需求与验收标准（A1~A15）
- [docs/day14-usability-test.md](docs/day14-usability-test.md) — Day 14 同伴测试清单 + 记录表 + 预演走查记录
- [docs/week2-verification.md](docs/week2-verification.md) — 第 2 周周验证日材料（附录 A 第三张卡）
- [TECH_DESIGN.md](TECH_DESIGN.md) — 技术设计：一句话路线、方案对比、数据流
- [DESIGN_RULES.md](DESIGN_RULES.md) — 设计规则（Day 9 定稿）：检查什么 / 遵守什么 / 怎么验证
- [.workbuddy/skills/kq-frontend-audit/](.workbuddy/skills/kq-frontend-audit/SKILL.md) — 项目内可复用 Skill（Day 12）：改 UI 前后按它过一遍，每项判据都是可复算的数字
- [AGENTS.md](AGENTS.md) — AI 协作规则书
