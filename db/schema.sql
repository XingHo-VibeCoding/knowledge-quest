-- ============================================================
-- db/schema.sql — 知识闯关 数据模型（Day 16）
-- 目标库：CloudBase PostgreSQL 17（环境 zgr202511108235qr-d2dkj33964b842）
-- 设计依据：api-contract.md 第二章「数据模型概览」
-- 执行方式：tcb db execute -e <envId> --sql "$(cat db/schema.sql)"
--
-- 可重复执行：先 DROP 再 CREATE，随时能推倒重来（开发阶段专用）
-- 表结构改动规矩：先改这份文件 → 同步改 api-contract.md → 再改代码
-- ============================================================

DROP TABLE IF EXISTS quiz_records;
DROP TABLE IF EXISTS cards;

-- ------------------------------------------------------------
-- 表一：cards —— 主对象（知识卡片）
--   一张卡 = 一个知识点：正面是问题，背面是答案
--   关系：cards.id ← quiz_records.card_ids（弱关联，见下）
-- ------------------------------------------------------------
CREATE TABLE cards (
  id          serial       PRIMARY KEY,
  subject     text         NOT NULL,
  sub         text         NOT NULL DEFAULT '',
  type        text         NOT NULL DEFAULT '问答',
  level       integer      NOT NULL DEFAULT 1,
  front       text         NOT NULL,
  back        text         NOT NULL,
  source      text         NOT NULL DEFAULT 'user',
  created_at  timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT cards_level_range   CHECK (level BETWEEN 1 AND 3),
  CONSTRAINT cards_source_domain CHECK (source IN ('mock', 'user'))
);

COMMENT ON TABLE  cards            IS '知识卡片（主对象）：正面问题、背面答案';
COMMENT ON COLUMN cards.id         IS '自增整数主键；前端本机临时 id 为字符串 u<时间戳>，上云后一律以本字段为准';
COMMENT ON COLUMN cards.subject    IS '科目/一级分类：口语 | 教务 | 专业课 | 销售（可自定义扩展，故用 text）';
COMMENT ON COLUMN cards.sub        IS '子分类/二级分类：如「职场表达」「排课」「光电」；空串表示未细分';
COMMENT ON COLUMN cards.type       IS '卡片类型：问答 | 跟读';
COMMENT ON COLUMN cards.level      IS '难度 1~3：1 入门 / 2 进阶 / 3 挑战';
COMMENT ON COLUMN cards.front      IS '正面：问题 / 题面';
COMMENT ON COLUMN cards.back       IS '背面：答案 / 参考表达';
COMMENT ON COLUMN cards.source     IS '来源：mock（种子数据） | user（用户新增）；Day 22「mock 卡不可删」据此判断';
COMMENT ON COLUMN cards.created_at IS '创建时间，带时区（项目时区 +08:00，避免 timestamp 歧义）';

-- 常用查询：按科目/子分类筛卡片墙（Day 17 的 GET /api/cards）
CREATE INDEX idx_cards_subject_sub ON cards (subject, sub);

-- ------------------------------------------------------------
-- 表二：quiz_records —— 记录（每次闯关的结果）
--   一轮闯关写一条；按时间累积，只增不改（历史快照）
-- ------------------------------------------------------------
CREATE TABLE quiz_records (
  id          serial       PRIMARY KEY,
  score       integer      NOT NULL,
  total       integer      NOT NULL,
  card_ids    integer[]    NOT NULL DEFAULT '{}',
  date        date         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT quiz_score_nonneg CHECK (score >= 0),
  CONSTRAINT quiz_total_range  CHECK (total BETWEEN 1 AND 100),
  CONSTRAINT quiz_score_lte_total CHECK (score <= total)
);

COMMENT ON TABLE  quiz_records            IS '闯关战绩记录：每完成一轮闯关写入一条';
COMMENT ON COLUMN quiz_records.id         IS '自增整数主键';
COMMENT ON COLUMN quiz_records.score      IS '本轮答对的题数（自判口径，见 PRD F6）';
COMMENT ON COLUMN quiz_records.total      IS '本轮总题数（固定抽 5 关，上限 100 留扩展）';
COMMENT ON COLUMN quiz_records.card_ids   IS '本轮抽中的卡片 id 数组，指向 cards.id；弱关联（数组包含，不建外键）——卡片被删也不改历史记录';
COMMENT ON COLUMN quiz_records.date       IS '成绩归属日期 YYYY-MM-DD（按用户本地日期，不用 UTC 切日）';
COMMENT ON COLUMN quiz_records.created_at IS '写入时间，带时区';

-- 常用查询：按日期倒序取最近战绩（Day 17 的 GET /api/quiz-records）
CREATE INDEX idx_quiz_records_date ON quiz_records (date DESC, id DESC);

-- ------------------------------------------------------------
-- 建表结果自检（执行后应看到 2 张表 + 3 个索引）
-- ------------------------------------------------------------
SELECT table_name AS "表"
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name IN ('cards', 'quiz_records')
 ORDER BY table_name;
