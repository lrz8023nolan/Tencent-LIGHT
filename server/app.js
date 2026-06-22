// 智能长者个案管理系统 - 后端服务入口
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { loadAllRules } = require('./services/ruleLoader');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== 中间件 ====================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务 - 前端页面
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// 静态文件服务 - 上传文件
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== 启动初始化 ====================
console.log('========================================');
console.log('  智能長者個案管理系統 - 後端服務');
console.log('========================================');

// 初始化数据库
console.log('[啟動] 初始化數據庫...');
const dbInstance = db.getDb();
console.log('[啟動] 數據庫就緒');

// 加载规则库
console.log('[啟動] 加載 JSON 規則庫...');
const ruleResult = loadAllRules();
if (!ruleResult.success) {
  console.warn('[啟動] ⚠️  部分規則庫文件缺失或加載失敗，相關功能可能受限');
  console.warn('[啟動] 請確認以下文件存在於 server/rules/ 目錄:');
  ruleResult.missing.forEach(f => console.warn(`  - ${f}`));
}

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ==================== API 路由 ====================
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/elders', require('./routes/elder'));
app.use('/api/intake', require('./routes/intake'));
app.use('/api/reports', require('./routes/report'));
app.use('/api/schedules', require('./routes/schedule'));
app.use('/api/folders', require('./routes/folder'));
app.use('/api/export', require('./routes/export'));
app.use('/api/rules', require('./routes/rules'));

// API 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rules: ruleResult.success ? 'all_loaded' : 'partial',
    rules_missing: ruleResult.missing,
    llm_configured: require('./services/llmClient').isConfigured()
  });
});

// 404 处理
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API 路徑不存在' });
});

// ==================== 全局错误处理 ====================
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: '文件大小超過 20MB 限制' });
    }
    return res.status(400).json({ success: false, error: `文件上傳錯誤: ${err.message}` });
  }
  
  res.status(500).json({ success: false, error: err.message || '服務器內部錯誤' });
});

// ==================== 启动服务 ====================
app.listen(PORT, () => {
  console.log(`\n[啟動] ✅ 後端服務已啟動: http://localhost:${PORT}`);
  console.log(`[啟動] API 基礎路徑: http://localhost:${PORT}/api`);
  console.log(`[啟動] 規則庫狀態: ${ruleResult.success ? '✅ 全部加載' : '⚠️ 部分缺失'}`);
  console.log(`[啟動] LLM API: ${require('./services/llmClient').isConfigured() ? '✅ 已配置' : '⚠️ 未配置（將使用模擬模式）'}`);
  console.log('\n可用的 API 端點:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/dashboard/summary');
  console.log('  GET  /api/dashboard/emergency-list');
  console.log('  GET  /api/elders');
  console.log('  GET  /api/elders/search?q=');
  console.log('  GET  /api/elders/:id');
  console.log('  PATCH /api/elders/:id');
  console.log('  GET  /api/elders/:id/recommendations');
  console.log('  GET  /api/elders/:id/resources');
  console.log('  POST /api/intake/upload');
  console.log('  POST /api/intake/analyze');
  console.log('  GET  /api/intake/status/:jobId');
  console.log('  GET  /api/reports/:elderId');
  console.log('  POST /api/reports/:elderId/regenerate');
  console.log('  GET  /api/schedules?date=');
  console.log('  POST /api/schedules');
  console.log('  PATCH /api/schedules/batch-complete');
  console.log('  GET  /api/folders');
  console.log('  POST /api/folders');
  console.log('  POST /api/folders/:id/add-elders');
  console.log('  GET  /api/folders/:id/elders');
  console.log('  POST /api/export/excel');
  console.log('  POST /api/rules/reload');
  console.log('  GET  /api/rules/status');
  console.log('========================================\n');
});

module.exports = app;
