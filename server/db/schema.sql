-- 智能长者个案管理系统 - 数据库 Schema
-- SQLite

-- 长者档案表
CREATE TABLE IF NOT EXISTS elders (
    id TEXT PRIMARY KEY,
    archive_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    age INTEGER,
    gender TEXT DEFAULT '',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    id_number TEXT DEFAULT '',
    emergency_contact_name TEXT DEFAULT '',
    emergency_contact_relation TEXT DEFAULT '',
    emergency_contact_phone TEXT DEFAULT '',
    district TEXT DEFAULT '',
    risk_level TEXT DEFAULT 'pending',       -- low/medium/high/pending
    overall_risk_level TEXT DEFAULT 'pending',
    health_tags TEXT DEFAULT '[]',            -- JSON array
    assessment_date TEXT DEFAULT '',
    responsible_worker TEXT DEFAULT '陳社工',
    status TEXT DEFAULT 'pending',            -- pending/verified
    is_pending_ai_review INTEGER DEFAULT 1,   -- 0=已核对, 1=待核对
    extracted_data_json TEXT DEFAULT '{}',    -- LLM 抽取的原始数据
    summary_text TEXT DEFAULT '',             -- AI 生成摘要
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 上传材料表
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    elder_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    file_path TEXT DEFAULT '',
    upload_date TEXT DEFAULT (datetime('now','localtime')),
    source_type TEXT DEFAULT 'upload',
    ocr_text TEXT DEFAULT '',
    extracted_data_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'uploaded',           -- uploaded/processing/completed/failed
    FOREIGN KEY (elder_id) REFERENCES elders(id)
);

-- 慢病详情表
CREATE TABLE IF NOT EXISTS chronic_disease_details (
    id TEXT PRIMARY KEY,
    elder_id TEXT NOT NULL,
    disease_name TEXT NOT NULL,
    disease_id TEXT DEFAULT '',
    ai_result TEXT DEFAULT '',
    evidence TEXT DEFAULT '',
    evidence_level TEXT DEFAULT '',
    source TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',            -- confirmed/self_reported/pending_clue/indicator_abnormal/not_found
    counted_as_chronic INTEGER DEFAULT 0,
    confidence REAL DEFAULT 0,
    last_updated TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (elder_id) REFERENCES elders(id)
);

-- 风险维度表
CREATE TABLE IF NOT EXISTS risk_dimensions (
    id TEXT PRIMARY KEY,
    elder_id TEXT NOT NULL,
    dimension_name TEXT NOT NULL,
    risk_level TEXT DEFAULT 'pending',        -- high/medium/low
    score REAL DEFAULT 0,
    key_reasons TEXT DEFAULT '[]',            -- JSON array
    missing_information TEXT DEFAULT '[]',    -- JSON array
    system_action TEXT DEFAULT '[]',          -- JSON array
    evidence TEXT DEFAULT '{}',               -- JSON object
    scoring_details TEXT DEFAULT '[]',        -- JSON array: 逐项评分详情
    last_updated TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (elder_id) REFERENCES elders(id)
);

-- 建议表
CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    elder_id TEXT NOT NULL,
    type TEXT DEFAULT '',                     -- social_worker/one_page/material_supplement
    dimension TEXT DEFAULT '',
    content TEXT DEFAULT '',
    source TEXT DEFAULT '',
    matched_rule_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (elder_id) REFERENCES elders(id)
);

-- 资源推荐表
CREATE TABLE IF NOT EXISTS resource_recommendations (
    id TEXT PRIMARY KEY,
    elder_id TEXT NOT NULL,
    resource_name_zh TEXT DEFAULT '',
    resource_name_en TEXT DEFAULT '',
    resource_type TEXT DEFAULT '',
    district TEXT DEFAULT '',
    address_zh TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    website TEXT DEFAULT '',
    opening_hours TEXT DEFAULT '',
    eligibility TEXT DEFAULT '',
    matched_reason TEXT DEFAULT '',
    source TEXT DEFAULT 'regional_resource_database',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (elder_id) REFERENCES elders(id)
);

-- 日程表
CREATE TABLE IF NOT EXISTS schedule_items (
    id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    date TEXT NOT NULL,
    elder_id TEXT DEFAULT '',
    elder_name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',            -- pending/completed
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (elder_id) REFERENCES elders(id)
);

-- 二级档案库文件夹表
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 文件夹-长者关联表
CREATE TABLE IF NOT EXISTS folder_elders (
    folder_id TEXT NOT NULL,
    elder_id TEXT NOT NULL,
    PRIMARY KEY (folder_id, elder_id),
    FOREIGN KEY (folder_id) REFERENCES folders(id),
    FOREIGN KEY (elder_id) REFERENCES elders(id)
);

-- 处理任务表（异步任务跟踪）
CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY,
    elder_id TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',            -- pending/uploading/ocr/llm_extract/rules_match/risk_score/comprehensive/completed/failed
    progress TEXT DEFAULT '[]',               -- JSON array of step statuses
    error_message TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_elders_risk_level ON elders(risk_level);
CREATE INDEX IF NOT EXISTS idx_elders_status ON elders(status);
CREATE INDEX IF NOT EXISTS idx_elders_name ON elders(name);
CREATE INDEX IF NOT EXISTS idx_materials_elder_id ON materials(elder_id);
CREATE INDEX IF NOT EXISTS idx_chronic_disease_elder_id ON chronic_disease_details(elder_id);
CREATE INDEX IF NOT EXISTS idx_risk_dimensions_elder_id ON risk_dimensions(elder_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_elder_id ON recommendations(elder_id);
CREATE INDEX IF NOT EXISTS idx_resource_recs_elder_id ON resource_recommendations(elder_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedule_items(date);
CREATE INDEX IF NOT EXISTS idx_folder_elders_folder ON folder_elders(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_elders_elder ON folder_elders(elder_id);
