// 管理端点 - 种子数据、维护操作
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { loadAllRules } = require('../services/ruleLoader');
const { evaluateChronicDiseases } = require('../services/chronicDiseaseEvaluator');
const { evaluateRisk } = require('../services/riskEvaluator');
const { matchRecommendations } = require('../services/recommendationService');
const { matchResources } = require('../services/resourceMatchingService');

// ==================== 种子数据 ====================
const seedElders = [
  {
    archive_no: 'ARC0001', name: '王阿婆', age: 78, gender: '女',
    address: '香港九龍觀塘區順利邨利明樓508室', phone: '2345-6789', id_number: 'A123456(7)',
    emergency_contact_name: '王志強', emergency_contact_relation: '兒子', emergency_contact_phone: '9876-5432',
    district: '觀塘區', responsible_worker: '陳社工', status: 'pending', is_pending_ai_review: 1,
    extracted_data: {
      basic_info: { name: '王阿婆', age: 78, gender: '女', address: '觀塘區順利邨利明樓508室', phone: '2345-6789', living_arrangement: '獨居', emergency_contact: { name: '王志強', relation: '兒子', phone: '9876-5432' } },
      health_history: { chronic_diseases: ['高血壓', '糖尿病'], medications: ['氨氯地平 5mg 每日一次', '二甲雙胍 500mg 每日兩次'], allergies: ['青黴素'] },
      functional_status: { mobility: '需扶杖行走', adl: '可自行進食、如廁', iadl: '需協助購物', fall_history: '過去一年跌倒1次' },
      cognitive_status: { memory: '輕度記憶力減退', orientation: '對時間有時混亂', communication: '能用廣東話溝通' },
      social_status: { living_arrangement: '獨居', caregiver_support: '兒子每週探望一次', community_participation: '偶爾參加社區中心活動', financial_status: '領取長者生活津貼' }
    }
  },
  {
    archive_no: 'ARC0002', name: '李伯', age: 82, gender: '男',
    address: '香港新界沙田區沙角邨銀鷗樓1202室', phone: '2612-3456', id_number: 'B789012(3)',
    emergency_contact_name: '李美玲', emergency_contact_relation: '女兒', emergency_contact_phone: '6543-2109',
    district: '沙田區', responsible_worker: '張社工', status: 'pending', is_pending_ai_review: 1,
    extracted_data: {
      basic_info: { name: '李伯', age: 82, gender: '男', address: '沙田區沙角邨銀鷗樓1202室', phone: '2612-3456', living_arrangement: '與配偶同住', emergency_contact: { name: '李美玲', relation: '女兒', phone: '6543-2109' } },
      health_history: { chronic_diseases: ['高血壓', '冠心病', '慢性阻塞性肺病'], medications: ['氯沙坦 50mg', '阿司匹林 100mg', '沙丁胺醇吸入劑'], allergies: [] },
      functional_status: { mobility: '需輪椅輔助', adl: '洗澡需協助', iadl: '需協助購物、備餐', fall_history: '過去一年跌倒2次' },
      cognitive_status: { memory: '有明顯記憶力下降', orientation: '有時不認得家人', communication: '能用廣東話溝通' },
      social_status: { living_arrangement: '與配偶同住', caregiver_support: '配偶年邁照顧能力有限', community_participation: '較少外出', financial_status: '領取長者生活津貼及傷殘津貼' }
    }
  },
  {
    archive_no: 'ARC0003', name: '陳婆婆', age: 75, gender: '女',
    address: '香港港島東區愛東邨愛旭樓305室', phone: '2891-2345', id_number: 'C345678(9)',
    emergency_contact_name: '陳家明', emergency_contact_relation: '兒子', emergency_contact_phone: '9123-4567',
    district: '東區', responsible_worker: '林社工', status: 'pending', is_pending_ai_review: 1,
    extracted_data: {
      basic_info: { name: '陳婆婆', age: 75, gender: '女', address: '東區愛東邨愛旭樓305室', phone: '2891-2345', living_arrangement: '與兒子一家同住', emergency_contact: { name: '陳家明', relation: '兒子', phone: '9123-4567' } },
      health_history: { chronic_diseases: ['糖尿病', '骨質疏鬆'], medications: ['胰島素 早10單位 晚8單位', '鈣片+維D'], allergies: ['磺胺類藥物'] },
      functional_status: { mobility: '行動自如', adl: '完全自理', iadl: '完全自理', fall_history: '無跌倒史' },
      cognitive_status: { memory: '正常', orientation: '正常', communication: '能用廣東話和普通話溝通' },
      social_status: { living_arrangement: '與家人同住', caregiver_support: '兒子及媳婦共同照顧', community_participation: '經常參加社區活動', financial_status: '家庭經濟狀況良好' }
    }
  }
];

router.post('/seed', async (req, res) => {
  try {
    const d = db.getDb();
    const count = d.prepare('SELECT COUNT(*) as cnt FROM elders').get().cnt;
    if (count > 0) {
      return res.json({ success: false, message: `資料庫已有 ${count} 條長者記錄，跳過種子數據`, skipped: true });
    }

    loadAllRules();
    let created = 0;
    for (const elder of seedElders) {
      const id = require('uuid').v4();
      const { extracted_data, ...fields } = elder;
      d.prepare(`INSERT INTO elders (id, archive_no, name, age, gender, address, phone, id_number, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, district, responsible_worker, status, is_pending_ai_review, extracted_data_json, risk_level, overall_risk_level, health_tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', '[]', datetime('now'), datetime('now'))`).run(
        id, fields.archive_no, fields.name, fields.age, fields.gender, fields.address, fields.phone, fields.id_number,
        fields.emergency_contact_name, fields.emergency_contact_relation, fields.emergency_contact_phone,
        fields.district, fields.responsible_worker, fields.status, fields.is_pending_ai_review, JSON.stringify(extracted_data)
      );

      try { evaluateChronicDiseases(id, extracted_data); } catch(e) { console.warn(`[Seed] 慢病評估跳過 ${fields.name}:`, e.message); }
      try { evaluateRisk(id, extracted_data); } catch(e) { console.warn(`[Seed] 風險評分跳過 ${fields.name}:`, e.message); }
      try { matchRecommendations(id); } catch(e) { console.warn(`[Seed] 建議匹配跳過 ${fields.name}:`, e.message); }
      try { matchResources(id); } catch(e) { console.warn(`[Seed] 資源匹配跳過 ${fields.name}:`, e.message); }

      created++;
    }

    res.json({ success: true, created, message: `已創建 ${created} 條長者記錄（含慢病評估、風險評分、建議及資源匹配）` });
  } catch (e) {
    console.error('[Admin/Seed]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
