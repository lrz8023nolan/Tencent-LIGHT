// 智能录入工作台 API
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { UPLOAD_DIR } = require('../services/fileStorageService');
const { processUpload, createInitialProgress } = require('../services/extractionService');

// 配置文件上传（multer）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支援的文件格式：${ext}。支援格式：PDF、JPG、PNG`));
    }
  }
});

// POST /api/intake/upload - 上传文件
router.post('/upload', upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '未上傳任何文件' });
    }

    const files = req.files.map(f => ({
      id: uuidv4(),
      originalName: f.originalname,
      storedName: f.filename,
      path: f.path,
      size: f.size,
      mimetype: f.mimetype
    }));

    res.json({
      success: true,
      data: {
        uploadId: uuidv4(),
        files,
        count: files.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/intake/analyze - 开始分析
router.post('/analyze', async (req, res) => {
  try {
    const { uploadId, elderId, files } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: '無文件可供分析' });
    }

    // 创建处理任务
    const job = db.createJob({
      elder_id: elderId || '',
      progress: createInitialProgress()
    });

    // 异步处理（不等待完成，通过 status 接口轮询）
    processUpload(job.id, files, elderId || null)
      .then(result => {
        console.log(`[Pipeline] 任务 ${job.id} 完成, elderId: ${result.elderId}`);
      })
      .catch(error => {
        console.error(`[Pipeline] 任务 ${job.id} 失败:`, error.message);
      });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        status: 'processing',
        message: '已開始處理，可通過 status 接口查詢進度'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/intake/status/:jobId - 查询处理进度
router.get('/status/:jobId', (req, res) => {
  try {
    const job = db.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: '任務不存在' });
    }

    res.json({
      success: true,
      data: {
        jobId: job.id,
        elderId: job.elder_id,
        status: job.status,
        progress: JSON.parse(job.progress || '[]'),
        error: job.error_message || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/intake/voice - 语音转录并分析
router.post('/voice', async (req, res) => {
  try {
    let { audioText, elderId } = req.body;
    if (!audioText || audioText.trim().length === 0) {
      return res.status(400).json({ success: false, error: '未收到语音文本' });
    }

    // 如果收到的是 base64 data URL，截取纯文本部分
    if (audioText.startsWith('data:')) {
      // base64 音频数据 — 由于 DeepSeek 不原生支持音频 STT，
      // 前端会降级为手动输入。这里接收文本即可。
      audioText = audioText.substring(audioText.indexOf(',') + 1);
      // 尝试解码 base64 看看是否是文本
      try {
        const decoded = Buffer.from(audioText, 'base64').toString('utf-8');
        if (decoded.length > 0 && decoded.length < 10000) {
          // 看起来是文本，用它
          audioText = decoded;
        }
      } catch(e) {
        // 保持原样，让 LLM 处理
      }
    }

    // 清理文本
    audioText = audioText.trim().substring(0, 8000);
    
    // 创建处理任务
    const jobId = 'voice_' + Date.now();
    const job = db.createJob({
      elder_id: elderId || '',
      progress: JSON.stringify(createInitialProgress())
    });

    // 直接走提取管道（跳过 OCR）
    const { extractElderInfo, generateSummary } = require('../services/llmClient');
    const { evaluateChronicDiseases, getChronicDiseaseTags } = require('../services/chronicDiseaseEvaluator');
    const { evaluateRisk } = require('../services/riskEvaluator');
    const { matchRecommendations } = require('../services/recommendationService');
    const { matchResources } = require('../services/resourceMatchingService');

    try {
      const extractedData = await extractElderInfo(audioText, ['語音錄入']);
      const basic = extractedData.basic_info || {};
      
      let eid;
      if (elderId) {
        eid = elderId;
        db.updateElder(elderId, { extracted_data: extractedData, assessment_date: new Date().toISOString().split('T')[0] });
      } else {
        const elder = db.createElder({
          name: basic.name || `長者_語音_${new Date().toISOString().slice(0, 10)}`,
          age: basic.age || null,
          gender: basic.gender || '',
          district: basic.district || '',
          extracted_data: extractedData,
          assessment_date: new Date().toISOString().split('T')[0],
          is_pending_ai_review: 1
        });
        eid = elder.id;
      }

      const chronicDetails = evaluateChronicDiseases(extractedData);
      db.saveChronicDiseaseDetails(eid, chronicDetails);
      const healthTags = getChronicDiseaseTags(chronicDetails);

      const riskResult = evaluateRisk(extractedData, chronicDetails);
      db.saveRiskDimensions(eid, riskResult.dimensions);
      const riskMap = { high: 'high', medium: 'medium', low: 'low' };
      db.updateElder(eid, { risk_level: riskMap[riskResult.overall_risk] || 'pending', overall_risk_level: riskResult.overall_risk, health_tags: healthTags });

      const recommendations = matchRecommendations(extractedData, chronicDetails, riskResult);
      db.saveRecommendations(eid, recommendations);
      const elderData = db.getElderById(eid);
      const resources = matchResources(elderData, chronicDetails, riskResult);
      db.saveResourceRecommendations(eid, resources);

      const summary = await generateSummary(extractedData, chronicDetails, riskResult);
      db.updateElder(eid, { summary_text: summary });

      db.updateJob(job.id, { status: 'completed', elder_id: eid });

      res.json({
        success: true,
        data: { jobId: job.id, elderId: eid, status: 'completed',
          summary: { name: elderData.name || basic.name, chronic_count: healthTags.length, health_tags: healthTags, risk_level: riskResult.overall_risk, judgment: extractedData.judgment_summary || null }
        }
      });
    } catch (err) {
      db.updateJob(job.id, { status: 'failed', error_message: err.message });
      throw err;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
