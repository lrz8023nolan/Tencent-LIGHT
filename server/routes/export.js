// 导出 API
const express = require('express');
const router = express.Router();
const db = require('../db/database');

// POST /api/export/excel - 导出 Excel（统一返回JSON，前端用SheetJS生成文件）
router.post('/excel', (req, res) => {
  try {
    const { elderIds } = req.body;
    
    if (!elderIds || !Array.isArray(elderIds) || elderIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '請先選擇需要匯出的長者' 
      });
    }

    // 获取选中的长者数据
    const elders = [];
    for (const id of elderIds) {
      const elder = db.getElderById(id);
      if (elder) {
        const healthTags = parseJson(elder.health_tags, []);
        const riskLabel = { high: '高風險', medium: '中風險', low: '低風險', pending: '待評估' };
        elders.push({
          archive_no: elder.archive_no || '',
          name: elder.name || '',
          age: elder.age || '',
          gender: elder.gender || '',
          risk_level: riskLabel[elder.risk_level] || elder.risk_level || '',
          health_tags: Array.isArray(healthTags) ? healthTags.join('、') : (healthTags || ''),
          assessment_date: elder.assessment_date || '',
          responsible_worker: elder.responsible_worker || '',
          status: elder.status === 'verified' ? '已核對' : '待核對'
        });
      }
    }

    // 统一返回 JSON，由前端 SheetJS 生成 xlsx 文件
    res.json({
      success: true,
      data: {
        format: 'json',
        columns: ['檔案編號', '姓名', '年齡', '性別', '風險等級', '健康標籤', '評估日期', '負責社工', '狀態'],
        rows: elders.map(e => [
          e.archive_no, e.name, e.age, e.gender, e.risk_level,
          e.health_tags, e.assessment_date, e.responsible_worker, e.status
        ])
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function parseJson(str, defaultValue) {
  try { return JSON.parse(str); } catch { return defaultValue; }
}

module.exports = router;
