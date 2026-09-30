---
name: kq-frontend-audit
description: 知识闯关前端规则自检 —— 改动页面结构 / 样式 / 交互的前后，按「修改前检查、修改后验证」两个动作 + 五类检查项（页面层级、颜色与字体、卡片与按钮、移动端适配、可访问性）过一遍，每项判据都必须落到可复算的数字。当要新增或修改 knowledge-quest 的 UI 时使用。
agent_created: true
---

# 知识闯关 · 前端规则自检

一句话：**把「看起来没问题」换成「算得出来的数字」。**
肉眼会漏（Day 9 实测：肉眼复审漏了 4 处 2.80~3.51:1 的文字），所以本 Skill 的每一项都指向一个数字或一次实测。

## 文件位置与调用方式

| 项 | 值 |
|---|---|
| Skill 文件 | 项目内 `.workbuddy/skills/kq-frontend-audit/SKILL.md` |
| 规则母文档 | 项目根 `DESIGN_RULES.md`（本 Skill 的判据来源，两者冲突以 DESIGN_RULES.md 为准） |
| 对比度复算脚本 | `.workbuddy/skills/kq-frontend-audit/check_contrast.py`（读同目录 `contrast-pairs.json`） |
| 可访问性脚本 | `.workbuddy/skills/kq-frontend-audit/a11y_check.js`（CDP，需本地服务器 + Edge） |
| 调用记录 | `.workbuddy/skills/kq-frontend-audit/CALL_LOG.md`（每次调用追加一条：提示词 → 判据 → 结果 → 差异） |
| 调用方式 | 动手前后各跑一次：`python check_contrast.py`；改交互时再跑 `node a11y_check.js <url>`；把两次输出贴进 CALL_LOG.md |

**3 个可观察的成功标准**

1. **修改前检查表 6 项全勾**：每项后面跟着证据（文件行号 / 命令 / 数值），出现"待确认"即为不通过。
2. **对比度脚本 0 FAIL**：`check_contrast.py` 输出 `FAIL 0 对`，且新增的任何「文字 × 背景」配色都已进入 `contrast-pairs.json`。
3. **实测无横向滚动 + 可访问性 0 FAIL**：375px 下 `document.scrollingElement.scrollWidth <= clientWidth`；`a11y_check.js` 输出 `fails: []`（可访问名、焦点样式、动态区域播报全齐）。

---

## 第 0 步 修改前检查（Pre-flight）· 动手前必须逐条回答

| # | 问题 | 不合格的样子（历史真实案例） |
|---|---|---|
| 1 | 这次改动**触碰哪些文件**？（HTML 结构 / CSS 样式 / JS 交互，分别列） | 说不清范围就动手 → 改动外溢到无关视图 |
| 2 | **新增或改变了哪些「文字 × 背景」配对**？（包括半透明叠加后的等效色） | Day 9：白字 chip 落在浅色区域 ≈1.6:1，几乎隐形 |
| 3 | 新增元素的**层级放在哪**？是否破坏「头部深色 / 主体浅色」的分区 | 深色区样式落到浅色区（语义错配） |
| 4 | 新增可点击元素有 **hover / focus / disabled** 哪些态？ | 只有默认态 = 用户得不到反馈 |
| 5 | 375px 下会不会**横向溢出**？长文案在哪换行？ | 定宽输入框 / 长单词撑破容器 |
| 6 | **功能边界**：这次只做这件事，明确「今天不做什么」 | 顺手重构 → 无法定位回归 |

落笔格式（每条都可被复核）：

```
[1] 触碰文件：index.html（结构）、css/style.css（样式）、js/main.js（交互）
[2] 新增配对：搜索框 placeholder #6b7280 on #fff → 待脚本复算
[3] 层级：新搜索栏放在 #view-wall 内、filters 之上，浅色区 → 沿用白底卡片规则
[4] 状态：搜索框 focus 有 outline；清除按钮 hover/focus；无 disabled 需求
[5] 移动端：searchwrap 用 flex:1 1 240px + min-width:0，375px 下整体换行
[6] 今天不做：不做子分类、不做卡片材料导入
```

## 第 1 步 五类检查项（改哪里查哪里，不必每次全跑）

### ① 页面层级
- 分区不混：`.top`（深色头部）只放导航类元素；`.container > main`（浅色主体）放内容；`.footer` 只放版权。
- 同一时刻只显示一种页面状态：`loading / empty / noResult / error / normal`（见 `showState()`），禁止两态同时可见。
- 新元素必须挂在已有分区里，不新增"漂浮层"；浮层仅 `#toast` 允许 `position: fixed`。
- 判据：`document.querySelectorAll('.hidden').length` 变化符合预期；截图里同一区域不出现两个状态块。

### ② 颜色与字体
- 文字颜色**只允许**取自 `css/style.css` `:root` 的 `--ink-*` / `--brand` token；新底色必须重新复算。
- 判据：WCAG AA —— 普通文字 ≥ **4.5:1**；大字（≥24px，或 ≥18.7px 且粗体）≥ **3:1**；**12px 粗体徽章不算大字，仍需 4.5:1**（历史重灾区）。
- 半透明底要按**叠加后的等效色**算：`等效 = α×前景 + (1-α)×底`，灰玻璃用 `rgba(0,0,0,.18)` 这类"压暗"叠加，别用"提亮"叠加配白字。
- 字体：正文 ≥13px，行高 ≥1.5；一处排版内不混用第三套字号。

### ③ 卡片与按钮
- 卡片：白底 + 1px `#e7e9f0` 边 + 12px 圆角 + 轻投影；只有「翻面」改变底色，翻面后答案文字用 `--brand`。
- 按钮：最小点击区 22×22（`.card-del`），圆角胶囊（`.chip` / `.retry`）；**处理中必须禁用并可读**（Day 11 的 `deleting` 状态机）。
- 每个可点击元素至少两态（hover/active/focus），且 focus 环必须可见：深色头部用 `#fff` 环，浅色主体用 `--brand` 环。
- 判据：`a11y_check.js` 的 `focusStyles` 段零缺失。

### ④ 移动端适配（375px）
- `.grid` / `.loading` 在 480px 断点降为单列；`.toolbar` / 表单改为纵向堆叠；chips 必须 `flex-wrap: wrap`。
- 长文本 `word-break: break-all`；表格/代码块允许横向滚动，**页面本身不允许**。
- 判据：CDP `Emulation.setDeviceMetricsOverride` 真 375px（Windows Edge `--window-size=375` 是假 375，最小窗宽 ~500px）后 `scrollWidth <= clientWidth`。

### ⑤ 可访问性（余力加练项，Day 12 起纳入）
- 每个 `button / input / select / textarea / a[href]` 有可访问名（可见文字，或 `aria-label`）。
- 表单控件有 `<label for>` 或 `aria-label` 关联；纯装饰元素加 `aria-hidden="true"`。
- 动态区域用 `role="status"` / `aria-live="polite"` 播报（筛选结果条、toast、无结果提示）。
- 视觉隐藏文字用 `.sr-only`（不用 `display:none`，否则读屏拿不到）。
- 判据：`a11y_check.js` 输出 `fails: []`。

## 第 2 步 修改后验证（Post-flight）

1. `python check_contrast.py` → 必须 `FAIL 0 对`；新增配对必须已在 `contrast-pairs.json` 里（漏登记 = 未验证）。
2. `node a11y_check.js http://localhost:8080/` → 必须 `fails: []`。
3. 功能路径实测：正常 / 无结果 / 清空恢复（改筛选时），或对应功能的三条路径各一次。
4. 桌面 + 375px 两个宽度截图，地址栏进图；把结果写回 `CALL_LOG.md`。
5. 只要有 FAIL：**先修，再重跑**，把「失败数值 → 修复后数值」一并记进 CALL_LOG。

## 迁移到其他项目

本 Skill 的框架与项目无关，换项目只需替换三处：① 读该项目的规则文档（本 Skill 用 `DESIGN_RULES.md`）② 换 token 表；③ `contrast-pairs.json` 换成该项目的配对清单。判据（4.5:1 / 3:1 / 375px / 可访问名）恒定不变。

## 已知判例（避免重复踩）

| 判例 | 数值 | 结论 |
|---|---|---|
| 白字 chip 落在浅色主区域（Day 9） | ≈1.6:1 | 语义错配，深色区样式不能搬到浅色区 |
| 12px 销售徽章 `#d97706 on #fdeee0`（Day 9 复审） | 2.80:1 | 12px 粗体不算大字，加深到 `#92400e` → 6.24:1 |
| 半透明玻璃底（`rgba(255,255,255,.16)`）叠白字（Day 12） | 3.11~3.99:1 | "提亮"叠加会让白字失效，改用压暗叠加 |
| 提示文字落在 `#f4f6fa` 浅灰底（Day 12） | 4.47:1 | 与白底差一点点也会掉到线下，浅灰底必须单独复算 |
| `.hidden` 被 `.toast` 的 `display:flex` 反杀（Day 12 截图发现，Day 11 引入） | toast 一直以 32×20 空黑条可见 | 新增会带 `display` 声明的可隐藏组件后，必须复查 `.hidden` 仍生效；工具类已用 `!important` 兜底 |
