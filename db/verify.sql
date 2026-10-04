-- ============================================================
-- db/verify.sql — Day 16 建表与种子自检（两条 select）
-- 用途：验证「每张核心表 select 至少 5 行」+ 表结构可读
-- 执行：node cli.js db execute -e <envId> --sql "<单条语句>"
--       （多语句只回最后一条结果，所以这里拆开单独执行）
-- ============================================================

-- ① 主对象表：cards —— 抽前 10 行（含科目/子分类/难度，验证与前端 mock 一致）
SELECT id, subject, sub, type, level, left(front, 18) AS "front(截断)" 
  FROM cards ORDER BY id LIMIT 10;

-- ② 记录表：quiz_records —— 全部 6 行（按日期倒序，验证 card_ids 数组）
SELECT id, score, total, card_ids, date 
  FROM quiz_records ORDER BY date DESC;

-- ③ 附：两表结构与约束（人工核对字段清单）
SELECT column_name AS "字段", data_type AS "类型", is_nullable AS "可空", column_default AS "默认值"
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'cards'
 ORDER BY ordinal_position;
