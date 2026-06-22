// 一页通报告 API
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { generateSummary } = require('../services/llmClient');
const { generateFamilyFriendlyRecommendations } = require('../services/recommendationService');

// GET /api/reports/:elderId - 获取一页通报告
router.get('/:elderId', (req, res) => {
  try {
    const elder = db.getElderById(req.params.elderId);
    if (!elder) {
      return res.status(404).json({ success: false, error: '长者档案不存在' });
    }

    const chronicDiseases = db.getChronicDiseaseDetails(req.params.elderId);
    const riskDimensions = db.getRiskDimensions(req.params.elderId);
    const recommendations = db.getRecommendations(req.params.elderId);
    const resources = db.getResourceRecommendations(req.params.elderId);

    // 生成家属友好版本
    const familyRecommendations = generateFamilyFriendlyRecommendations(
      recommendations.map(r => ({ dimension: r.dimension, content: r.content })),
      chronicDiseases,
      { dimensions: riskDimensions.map(d => ({ ...d, riskLevel: d.risk_level })) }
    );

    // 风险语言转换
    const riskLevelMap = {
      high: '需要優先關注',
      medium: '建議持續留意',
      low: '目前情況相對穩定',
      pending: '待評估'
    };

    const report = {
      elder_name: elder.name,
      elder_age: elder.age,
      elder_gender: elder.gender,
      archive_no: elder.archive_no,
      assessment_date: elder.assessment_date,
      updated_at: elder.updated_at,
      
      // 健康摘要
      chronic_diseases: chronicDiseases
        .filter(d => d.counted_as_chronic === 1 || d.status === 'confirmed')
        .map(d => ({
          name: d.disease_name,
          status: d.status === 'confirmed' ? '已確診' : '需跟進',
          evidence_summary: d.ai_result || ''
        })),
      
      // 风险摘要（温和表达）
      risk_summary: riskDimensions.map(d => ({
        dimension: d.dimension_name,
        risk_label: riskLevelMap[d.risk_level] || d.risk_level,
        key_concerns: parseJson(d.key_reasons, []).map(r => 
          r.replace(/高風險/g, '需要優先關注')
           .replace(/中風險/g, '建議持續留意')
           .replace(/低風險/g, '目前情況相對穩定')
        )
      })),
      
      overall_risk_label: riskLevelMap[elder.overall_risk_level] || '待評估',
      
      // 建议（家属友好版）
      recommendations: familyRecommendations,
      
      // 推荐资源
      recommended_resources: resources.map(r => ({
        name: r.resource_name_zh,
        type: r.resource_type,
        address: r.address_zh,
        phone: r.contact,
        reason: r.matched_reason
      })),
      
      // 待补充资料
      missing_info: riskDimensions.flatMap(d => parseJson(d.missing_information, [])),
      
      // 社工摘要
      summary: elder.summary_text || ''
    };

    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/reports/:elderId/regenerate - 重新生成报告
router.post('/:elderId/regenerate', async (req, res) => {
  try {
    const elder = db.getElderById(req.params.elderId);
    if (!elder) {
      return res.status(404).json({ success: false, error: '长者档案不存在' });
    }

    const chronicDiseases = db.getChronicDiseaseDetails(req.params.elderId);
    const riskDimensions = db.getRiskDimensions(req.params.elderId);
    
    const extractedData = parseJson(elder.extracted_data_json, {});
    const riskResult = {
      overall_risk: elder.overall_risk_level,
      dimensions: riskDimensions.map(d => ({
        dimension_name: d.dimension_name,
        riskLevel: d.risk_level
      }))
    };

    const summary = await generateSummary(extractedData, chronicDiseases, riskResult);
    db.updateElder(req.params.elderId, { summary_text: summary });

    res.json({ success: true, data: { summary } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function parseJson(str, defaultValue) {
  try { return JSON.parse(str); } catch { return defaultValue; }
}

module.exports = router;
