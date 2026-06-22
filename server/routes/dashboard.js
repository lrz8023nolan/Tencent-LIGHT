// 首页仪表板 API
const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/dashboard/summary - 首页统计
router.get('/summary', (req, res) => {
  try {
    const summary = db.getDashboardSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dashboard/emergency-list - 紧急干预清单
router.get('/emergency-list', (req, res) => {
  try {
    const list = db.getEmergencyList();
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
