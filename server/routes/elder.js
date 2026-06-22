// 长者档案 API
const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/elders - 长者列表（支持筛选）
router.get('/', (req, res) => {
  try {
    const { query, riskLevel, ageRange, healthTag, status, folderId } = req.query;
    const elders = db.getAllElders({ query, riskLevel, ageRange, healthTag, status, folderId });
    
    // 解析 JSON 字段
    const parsed = elders.map(e => ({
      ...e,
      health_tags: parseJson(e.health_tags, []),
      extracted_data_json: undefined // 不返回原始抽取数据
    }));
    
    res.json({ success: true, data: parsed, total: parsed.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/elders/search - 搜索长者（用于搜索建议）
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) {
      return res.json({ success: true, data: [] });
    }
    const results = db.searchElders(q);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/elders/:id - 长者详情
router.get('/:id', (req, res) => {
  try {
    const elder = db.getElderById(req.params.id);
    if (!elder) {
      return res.status(404).json({ success: false, error: '长者档案不存在' });
    }

    // 获取关联数据
    const materials = db.getMaterialsByElderId(req.params.id);
    const chronicDiseases = db.getChronicDiseaseDetails(req.params.id);
    const riskDimensions = db.getRiskDimensions(req.params.id);
    const recommendations = db.getRecommendations(req.params.id);
    const resources = db.getResourceRecommendations(req.params.id);

    res.json({
      success: true,
      data: {
        ...elder,
        health_tags: parseJson(elder.health_tags, []),
        extracted_data: parseJson(elder.extracted_data_json, {}),
        materials,
        chronic_diseases: chronicDiseases.map(d => ({
          ...d,
          counted_as_chronic: d.counted_as_chronic === 1
        })),
        risk_dimensions: riskDimensions.map(d => ({
          ...d,
          key_reasons: parseJson(d.key_reasons, []),
          missing_information: parseJson(d.missing_information, []),
          system_action: parseJson(d.system_action, []),
          scoring_details: parseJson(d.scoring_details, [])
        })),
        recommendations,
        resources
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/elders/:id - 更新长者档案（社工核对）
router.patch('/:id', (req, res) => {
  try {
    const elder = db.getElderById(req.params.id);
    if (!elder) {
      return res.status(404).json({ success: false, error: '长者档案不存在' });
    }

    const updated = db.updateElder(req.params.id, req.body);
    res.json({
      success: true,
      data: {
        ...updated,
        health_tags: parseJson(updated.health_tags, [])
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/elders/:id/recommendations - 获取建议
router.get('/:id/recommendations', (req, res) => {
  try {
    const recommendations = db.getRecommendations(req.params.id);
    res.json({ success: true, data: recommendations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/elders/:id/resources - 获取资源推荐
router.get('/:id/resources', (req, res) => {
  try {
    const resources = db.getResourceRecommendations(req.params.id);
    res.json({ success: true, data: resources });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/elders/:id - 删除长者档案
router.delete('/:id', (req, res) => {
  try {
    const elder = db.getElderById(req.params.id);
    if (!elder) {
      return res.status(404).json({ success: false, error: '长者档案不存在' });
    }
    db.deleteElder(req.params.id);
    res.json({ success: true, message: '已删除长者档案' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/elders/batch-delete - 批量删除长者档案
router.post('/batch-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '未提供有效的長者ID列表' });
    }
    const result = db.deleteElders(ids);
    res.json({ success: true, message: `已成功刪除 ${result.deleted} 筆長者檔案`, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function parseJson(str, defaultValue) {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

module.exports = router;
