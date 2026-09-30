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


- **Day 12**：项目内 Skill（`.workbuddy/skills/kq-frontend-audit/`：SKILL.md + 对比度复算脚本 + 可访问性脚本 + 调用记录）并真实调用——修改前复算揪出 7 处存量对比度不达标、可访问性脚本揪出表单缺标签、截图揪出 `.hidden` 被 toast 反杀的 Day 11 遗留 bug；关键词 + 科目组合筛选上线（有结果 / 无结果 / 清空恢复三态，筛选条件写入 URL 可直达）
- **Day 10**：截图+自然语言定位修复——闯关提示文案与真实交互对齐（「翻面核对」→「点下方按钮核对」），CDP 设备仿真实测 375px 无溢出
- **Day 11**：删除卡片交互补全状态反馈——处理中禁用防重复提交、成功 toast + 5 秒撤销、失败原地提示下一步；三路径（正常/重复/失败）CDP 自动化测试全过
- **Day 9**：设计规则审查修复（筛选chips对比度 / 次要文字 WCAG AA / 表单对齐 / 间距，前后截图对比）+ `--ink-*` 颜色 token 约束；闯关模式雏形（抽 5 关 → 自答 → 翻面核对 → 自判 → 成绩单 + 本机最佳战绩）+ 添加卡片（localStorage 本机持久化，自存卡可删、参与闯关）
- **Day 8**：主视图（mock 数据版）——知识卡片墙 + 科目筛选 + 随机复习 + 点击翻面；四种页面状态（加载/空/错误/正常）齐备
- 旧项目「今日热搜」（jinri-hot-search）保留作为存档，Day 8 起主线切换到本项目

## 技术栈

纯 HTML / CSS / JavaScript（原生，无框架）+ 本地 JSON mock 数据；第 3 周起接真实 API。

## 文档链

- [research.md](research.md) — 选题调研：为什么换掉热搜
- [PRD.md](PRD.md) — 产品需求与验收标准（A1~A15）
- [TECH_DESIGN.md](TECH_DESIGN.md) — 技术设计：一句话路线、方案对比、数据流
- [DESIGN_RULES.md](DESIGN_RULES.md) — 设计规则（Day 9 定稿）：检查什么 / 遵守什么 / 怎么验证
- [.workbuddy/skills/kq-frontend-audit/](.workbuddy/skills/kq-frontend-audit/SKILL.md) — 项目内可复用 Skill（Day 12）：改 UI 前后按它过一遍，每项判据都是可复算的数字
- [AGENTS.md](AGENTS.md) — AI 协作规则书
