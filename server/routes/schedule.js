// 日程 API
const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/schedules?date=YYYY-MM-DD
router.get('/', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const schedules = db.getSchedules(date);
    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/schedules
router.post('/', (req, res) => {
  try {
    const { time, date, elderId, elderName, description } = req.body;
    if (!time || !date) {
      return res.status(400).json({ success: false, error: '時間和日期為必填項' });
    }
    const schedule = db.createSchedule({ time, date, elder_id: elderId || '', elder_name: elderName || '', description: description || '' });
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/schedules/batch-complete
router.patch('/batch-complete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '請提供需要完成的日程ID' });
    }
    const result = db.batchCompleteSchedules(ids);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
