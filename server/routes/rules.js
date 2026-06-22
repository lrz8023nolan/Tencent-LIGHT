// 规则库管理 API
const express = require('express');
const router = express.Router();
const { reloadRules, getStatus } = require('../services/ruleLoader');

// POST /api/rules/reload - 重新加载规则库
router.post('/reload', (req, res) => {
  try {
    const result = reloadRules();
    res.json({ 
      success: result.success,
      data: result,
      message: result.success ? '規則庫已重新加載' : '規則庫重新加載時出現問題，請檢查服務器日誌'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/rules/status - 规则库状态
router.get('/status', (req, res) => {
  try {
    const status = getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
