// 数据库操作模块 - 封装所有数据库 CRUD 操作
const { initDatabase } = require('./init');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let db = null;

function getDb() {
  if (!db) {
    db = initDatabase();
  }
  return db;
}

// ==================== 长者档案 ====================

function getAllElders(filters = {}) {
  const d = getDb();
  let sql = 'SELECT * FROM elders WHERE 1=1';
  const params = [];

  if (filters.query) {
    sql += ' AND (name LIKE ? OR id_number LIKE ? OR phone LIKE ?)';
    const q = `%${filters.query}%`;
    params.push(q, q, q);
  }
  if (filters.riskLevel && filters.riskLevel !== 'all') {
    sql += ' AND risk_level = ?';
    params.push(filters.riskLevel);
  }
  if (filters.ageRange && filters.ageRange !== 'all') {
    const [min, max] = filters.ageRange.split('-').map(Number);
    if (max) {
      sql += ' AND age >= ? AND age <= ?';
      params.push(min, max);
    } else if (filters.ageRange === '90+') {
      sql += ' AND age >= 90';
    }
  }
  if (filters.healthTag && filters.healthTag !== 'all') {
    sql += ' AND health_tags LIKE ?';
    params.push(`%"${filters.healthTag}"%`);
  }
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.folderId) {
    sql += ' AND id IN (SELECT elder_id FROM folder_elders WHERE folder_id = ?)';
    params.push(filters.folderId);
  }

  sql += ' ORDER BY updated_at DESC';
  return d.prepare(sql).all(...params);
}

function getElderById(id) {
  const d = getDb();
  return d.prepare('SELECT * FROM elders WHERE id = ?').get(id);
}

function searchElders(query) {
  const d = getDb();
  return d.prepare(
    'SELECT id, name, archive_no, age, risk_level FROM elders WHERE name LIKE ? OR id_number LIKE ? OR phone LIKE ? LIMIT 10'
  ).all(`%${query}%`, `%${query}%`, `%${query}%`);
}

function createElder(data) {
  const d = getDb();
  const id = uuidv4();
  const archiveNo = data.archive_no || `ARC${Date.now().toString(36).toUpperCase()}`;
  
  d.prepare(`INSERT INTO elders (id, archive_no, name, age, gender, address, phone, id_number,
    emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
    district, risk_level, overall_risk_level, health_tags, assessment_date,
    responsible_worker, status, is_pending_ai_review, extracted_data_json, summary_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, archiveNo,
    data.name || '', data.age || null, data.gender || '', data.address || '',
    data.phone || '', data.id_number || '',
    data.emergency_contact_name || '', data.emergency_contact_relation || '', data.emergency_contact_phone || '',
    data.district || '', data.risk_level || 'pending', data.overall_risk_level || 'pending',
    JSON.stringify(data.health_tags || []), data.assessment_date || new Date().toISOString().split('T')[0],
    data.responsible_worker || '陳社工', data.status || 'pending', data.is_pending_ai_review !== undefined ? data.is_pending_ai_review : 1,
    JSON.stringify(data.extracted_data || {}), data.summary_text || ''
  );
  return getElderById(id);
}

function updateElder(id, data) {
  const d = getDb();
  const existing = getElderById(id);
  if (!existing) return null;

  const fields = [];
  const params = [];

  const updatableFields = [
    'name', 'age', 'gender', 'address', 'phone', 'id_number',
    'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone',
    'district', 'risk_level', 'overall_risk_level', 'assessment_date',
    'responsible_worker', 'status', 'is_pending_ai_review', 'summary_text'
  ];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(data[field]);
    }
  }

  if (data.health_tags !== undefined) {
    fields.push('health_tags = ?');
    params.push(JSON.stringify(data.health_tags));
  }
  if (data.extracted_data !== undefined) {
    fields.push('extracted_data_json = ?');
    params.push(JSON.stringify(data.extracted_data));
  }

  fields.push("updated_at = datetime('now','localtime')");
  params.push(id);

  d.prepare(`UPDATE elders SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getElderById(id);
}

function deleteElder(id) {
  const d = getDb();
  // 级联删除所有关联数据
  d.prepare('DELETE FROM chronic_disease_details WHERE elder_id = ?').run(id);
  d.prepare('DELETE FROM risk_dimensions WHERE elder_id = ?').run(id);
  d.prepare('DELETE FROM recommendations WHERE elder_id = ?').run(id);
  d.prepare('DELETE FROM resource_recommendations WHERE elder_id = ?').run(id);
  d.prepare('DELETE FROM materials WHERE elder_id = ?').run(id);
  d.prepare('DELETE FROM folder_elders WHERE elder_id = ?').run(id);
  d.prepare('DELETE FROM schedule_items WHERE elder_id = ?').run(id);
  d.prepare('DELETE FROM processing_jobs WHERE elder_id = ?').run(id);
  d.prepare('DELETE FROM elders WHERE id = ?').run(id);
  return { deleted: true, id };
}

function deleteElders(ids) {
  if (!ids || ids.length === 0) return { deleted: 0 };
  const d = getDb();
  const placeholders = ids.map(() => '?').join(',');
  // better-sqlite3 transaction() returns a function; invoke it immediately
  const deleted = d.transaction(() => {
    d.prepare(`DELETE FROM chronic_disease_details WHERE elder_id IN (${placeholders})`).run(...ids);
    d.prepare(`DELETE FROM risk_dimensions WHERE elder_id IN (${placeholders})`).run(...ids);
    d.prepare(`DELETE FROM recommendations WHERE elder_id IN (${placeholders})`).run(...ids);
    d.prepare(`DELETE FROM resource_recommendations WHERE elder_id IN (${placeholders})`).run(...ids);
    d.prepare(`DELETE FROM materials WHERE elder_id IN (${placeholders})`).run(...ids);
    d.prepare(`DELETE FROM folder_elders WHERE elder_id IN (${placeholders})`).run(...ids);
    d.prepare(`DELETE FROM schedule_items WHERE elder_id IN (${placeholders})`).run(...ids);
    d.prepare(`DELETE FROM processing_jobs WHERE elder_id IN (${placeholders})`).run(...ids);
    const result = d.prepare(`DELETE FROM elders WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  })();
  return { deleted, count: ids.length };
}

function getDashboardSummary() {
  const d = getDb();
  const total = d.prepare('SELECT COUNT(*) as count FROM elders').get();
  const highRisk = d.prepare("SELECT COUNT(*) as count FROM elders WHERE risk_level = 'high'").get();
  const pendingReview = d.prepare('SELECT COUNT(*) as count FROM elders WHERE is_pending_ai_review = 1').get();
  
  return {
    total_elders: total.count,
    high_risk_elders: highRisk.count,
    pending_ai_review: pendingReview.count,
    data_updated_at: new Date().toISOString()
  };
}

function getEmergencyList() {
  const d = getDb();
  return d.prepare(
    "SELECT id, name, age, risk_level, overall_risk_level, health_tags, assessment_date, summary_text FROM elders WHERE risk_level = 'high' ORDER BY updated_at DESC LIMIT 20"
  ).all();
}

// ==================== 材料 ====================

function createMaterial(data) {
  const d = getDb();
  const id = uuidv4();
  d.prepare(`INSERT INTO materials (id, elder_id, file_name, file_type, file_size, file_path, source_type, ocr_text, extracted_data_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.elder_id, data.file_name, data.file_type, data.file_size, data.file_path, data.source_type || 'upload', data.ocr_text || '', JSON.stringify(data.extracted_data || {}), data.status || 'uploaded');
  return getMaterialById(id);
}

function getMaterialById(id) {
  const d = getDb();
  return d.prepare('SELECT * FROM materials WHERE id = ?').get(id);
}

function getMaterialsByElderId(elderId) {
  const d = getDb();
  return d.prepare('SELECT * FROM materials WHERE elder_id = ? ORDER BY upload_date DESC').all(elderId);
}

function updateMaterial(id, data) {
  const d = getDb();
  const fields = [];
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    params.push(typeof value === 'object' ? JSON.stringify(value) : value);
  }
  params.push(id);
  d.prepare(`UPDATE materials SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getMaterialById(id);
}

// ==================== 慢病详情 ====================

function saveChronicDiseaseDetails(elderId, details) {
  const d = getDb();
  // 删除旧数据
  d.prepare('DELETE FROM chronic_disease_details WHERE elder_id = ?').run(elderId);
  
  const insertStmt = d.prepare(`INSERT INTO chronic_disease_details (id, elder_id, disease_name, disease_id, ai_result, evidence, evidence_level, source, status, counted_as_chronic, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  const insertMany = d.transaction((items) => {
    for (const item of items) {
      insertStmt.run(
        uuidv4(), elderId,
        item.disease_name, item.disease_id || '', item.ai_result || '',
        item.evidence || '', item.evidence_level || '', item.source || '',
        item.status || 'pending', item.counted_as_chronic ? 1 : 0, item.confidence || 0
      );
    }
  });
  
  insertMany(details);
}

function getChronicDiseaseDetails(elderId) {
  const d = getDb();
  return d.prepare('SELECT * FROM chronic_disease_details WHERE elder_id = ?').all(elderId);
}

// ==================== 风险维度 ====================

function saveRiskDimensions(elderId, dimensions) {
  const d = getDb();
  d.prepare('DELETE FROM risk_dimensions WHERE elder_id = ?').run(elderId);
  
  const insertStmt = d.prepare(`INSERT INTO risk_dimensions (id, elder_id, dimension_name, risk_level, score, key_reasons, missing_information, system_action, evidence, scoring_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  const insertMany = d.transaction((items) => {
    for (const item of items) {
      insertStmt.run(
        uuidv4(), elderId,
        item.dimension_name, (item.riskLevel || item.risk_level), item.score || 0,
        JSON.stringify(item.reasons || item.key_reasons || []),
        JSON.stringify(item.missingInfo || item.missing_information || []),
        JSON.stringify(item.system_action || []), JSON.stringify(item.evidence || {}),
        JSON.stringify(item.scoring_details || item.details || [])
      );
    }
  });
  
  insertMany(dimensions);
}

function getRiskDimensions(elderId) {
  const d = getDb();
  return d.prepare('SELECT * FROM risk_dimensions WHERE elder_id = ?').all(elderId);
}

// ==================== 建议 ====================

function saveRecommendations(elderId, recommendations) {
  const d = getDb();
  d.prepare('DELETE FROM recommendations WHERE elder_id = ?').run(elderId);
  
  const insertStmt = d.prepare(`INSERT INTO recommendations (id, elder_id, type, dimension, content, source, matched_rule_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  
  const insertMany = d.transaction((items) => {
    for (const item of items) {
      insertStmt.run(
        uuidv4(), elderId, item.type || '', item.dimension || '',
        item.content, item.source || '', item.matched_rule_id || ''
      );
    }
  });
  
  insertMany(recommendations);
}

function getRecommendations(elderId) {
  const d = getDb();
  return d.prepare('SELECT * FROM recommendations WHERE elder_id = ?').all(elderId);
}

// ==================== 资源推荐 ====================

function saveResourceRecommendations(elderId, resources) {
  const d = getDb();
  d.prepare('DELETE FROM resource_recommendations WHERE elder_id = ?').run(elderId);
  
  const insertStmt = d.prepare(`INSERT INTO resource_recommendations (id, elder_id, resource_name_zh, resource_name_en, resource_type, district, address_zh, contact, website, opening_hours, eligibility, matched_reason, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  const insertMany = d.transaction((items) => {
    for (const item of items) {
      insertStmt.run(
        uuidv4(), elderId,
        item.resource_name_zh || '', item.resource_name_en || '', item.resource_type || '',
        item.district || '', item.address_zh || '', item.contact || '',
        item.website || '', item.opening_hours || '', item.eligibility || '',
        item.matched_reason || '', item.source || 'regional_resource_database'
      );
    }
  });
  
  insertMany(resources);
}

function getResourceRecommendations(elderId) {
  const d = getDb();
  return d.prepare('SELECT * FROM resource_recommendations WHERE elder_id = ?').all(elderId);
}

// ==================== 日程 ====================

function getSchedules(date) {
  const d = getDb();
  return d.prepare('SELECT * FROM schedule_items WHERE date = ? ORDER BY time ASC').all(date);
}

function createSchedule(data) {
  const d = getDb();
  const id = uuidv4();
  d.prepare('INSERT INTO schedule_items (id, time, date, elder_id, elder_name, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, data.time, data.date, data.elder_id || '', data.elder_name || '', data.description || '', 'pending');
  return d.prepare('SELECT * FROM schedule_items WHERE id = ?').get(id);
}

function batchCompleteSchedules(ids) {
  const d = getDb();
  const stmt = d.prepare('UPDATE schedule_items SET status = ? WHERE id = ?');
  const batch = d.transaction((itemIds) => {
    for (const id of itemIds) {
      stmt.run('completed', id);
    }
  });
  batch(ids);
  return { updated: ids.length };
}

// ==================== 二级档案库 ====================

function getFolders() {
  const d = getDb();
  return d.prepare('SELECT * FROM folders ORDER BY created_at DESC').all();
}

function createFolder(name) {
  const d = getDb();
  const id = uuidv4();
  d.prepare('INSERT INTO folders (id, name) VALUES (?, ?)').run(id, name);
  return d.prepare('SELECT * FROM folders WHERE id = ?').get(id);
}

function addEldersToFolder(folderId, elderIds) {
  const d = getDb();
  const stmt = d.prepare('INSERT OR IGNORE INTO folder_elders (folder_id, elder_id) VALUES (?, ?)');
  const batch = d.transaction((ids) => {
    for (const eid of ids) {
      stmt.run(folderId, eid);
    }
  });
  batch(elderIds);
  return { added: elderIds.length };
}

function getFolderElders(folderId) {
  const d = getDb();
  return d.prepare(`
    SELECT e.* FROM elders e
    JOIN folder_elders fe ON e.id = fe.elder_id
    WHERE fe.folder_id = ?
    ORDER BY e.updated_at DESC
  `).all(folderId);
}

// ==================== 处理任务 ====================

function createJob(data) {
  const d = getDb();
  const id = uuidv4();
  d.prepare('INSERT INTO processing_jobs (id, elder_id, status, progress) VALUES (?, ?, ?, ?)')
    .run(id, data.elder_id || '', 'pending', JSON.stringify(data.progress || []));
  return getJob(id);
}

function getJob(id) {
  const d = getDb();
  return d.prepare('SELECT * FROM processing_jobs WHERE id = ?').get(id);
}

function updateJob(id, data) {
  const d = getDb();
  const fields = [];
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    params.push(typeof value === 'object' ? JSON.stringify(value) : value);
  }
  fields.push("updated_at = datetime('now','localtime')");
  params.push(id);
  d.prepare(`UPDATE processing_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getJob(id);
}

module.exports = {
  getDb,
  // 长者
  getAllElders, getElderById, searchElders, createElder, updateElder, deleteElder, deleteElders,
  getDashboardSummary, getEmergencyList,
  // 材料
  createMaterial, getMaterialById, getMaterialsByElderId, updateMaterial,
  // 慢病
  saveChronicDiseaseDetails, getChronicDiseaseDetails,
  // 风险
  saveRiskDimensions, getRiskDimensions,
  // 建议
  saveRecommendations, getRecommendations,
  // 资源
  saveResourceRecommendations, getResourceRecommendations,
  // 日程
  getSchedules, createSchedule, batchCompleteSchedules,
  // 文件夹
  getFolders, createFolder, addEldersToFolder, getFolderElders,
  // 任务
  createJob, getJob, updateJob
};
