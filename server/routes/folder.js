// 二级档案库 API
const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/folders
router.get('/', (req, res) => {
  try {
    const folders = db.getFolders();
    res.json({ success: true, data: folders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/folders
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: '請輸入二級檔案庫名稱' });
    }
    const folder = db.createFolder(name);
    res.json({ success: true, data: folder });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/folders/:id/add-elders
router.post('/:id/add-elders', (req, res) => {
  try {
    const { elderIds } = req.body;
    if (!elderIds || !Array.isArray(elderIds) || elderIds.length === 0) {
      return res.status(400).json({ success: false, error: '請選擇需要添加的長者' });
    }
    const result = db.addEldersToFolder(req.params.id, elderIds);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/folders/:id/elders
router.get('/:id/elders', (req, res) => {
  try {
    const elders = db.getFolderElders(req.params.id);
    const parsed = elders.map(e => ({
      ...e,
      health_tags: parseJson(e.health_tags, [])
    }));
    res.json({ success: true, data: parsed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/folders/:folderId/elders/:elderId - 从文件夹中移除长者
router.delete('/:folderId/elders/:elderId', (req, res) => {
  try {
    const d = db.getDb();
    d.prepare('DELETE FROM folder_elders WHERE folder_id = ? AND elder_id = ?').run(req.params.folderId, req.params.elderId);
    res.json({ success: true, message: '已从文件夹移除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function parseJson(str, defaultValue) {
  try { return JSON.parse(str); } catch { return defaultValue; }
}

module.exports = router;
