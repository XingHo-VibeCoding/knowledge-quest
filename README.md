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

- **Day 8**：主视图（mock 数据版）——知识卡片墙 + 科目筛选 + 随机复习 + 点击翻面；四种页面状态（加载/空/错误/正常）齐备
- 旧项目「今日热搜」（jinri-hot-search）保留作为存档，Day 8 起主线切换到本项目

## 技术栈

纯 HTML / CSS / JavaScript（原生，无框架）+ 本地 JSON mock 数据；第 3 周起接真实 API。

## 文档链

- [research.md](research.md) — 选题调研：为什么换掉热搜
- [PRD.md](PRD.md) — 产品需求与验收标准（A1~A10）
- [TECH_DESIGN.md](TECH_DESIGN.md) — 技术设计：一句话路线、方案对比、数据流
- [AGENTS.md](AGENTS.md) — AI 协作规则书
