// 信息抽取管道 - 编排完整的 OCR → LLM → 规则计算 → 数据库保存流程
const { extractText } = require('./ocrService');
const { extractElderInfo, generateSummary } = require('./llmClient');
const { evaluateChronicDiseases, getChronicDiseaseTags } = require('./chronicDiseaseEvaluator');
const { evaluateRisk } = require('./riskEvaluator');
const { matchRecommendations } = require('./recommendationService');
const { matchResources } = require('./resourceMatchingService');
const db = require('../db/database');

// 处理流程步骤定义
const PIPELINE_STEPS = [
  { key: 'upload', name: '檔案上傳完成', order: 1 },
  { key: 'ocr', name: 'OCR / 文檔文本提取中', order: 2 },
  { key: 'llm', name: 'LLM 結構化識別中', order: 3 },
  { key: 'extracted', name: '生成 extracted_data 中', order: 4 },
  { key: 'chronic', name: '慢病標籤規則匹配中', order: 5 },
  { key: 'risk', name: '五維度風險評分中', order: 6 },
  { key: 'comprehensive', name: '綜合風險判斷中', order: 7 },
  { key: 'recommendations', name: '社工建議生成中', order: 8 },
  { key: 'completed', name: '已加入檔案庫 / 待核對 AI 表單', order: 9 }
];

function createInitialProgress() {
  return PIPELINE_STEPS.map(step => ({
    ...step,
    status: step.key === 'upload' ? 'completed' : 'pending'
  }));
}

// 完整处理管道
async function processUpload(jobId, filePaths, elderId = null) {
  const job = db.getJob(jobId);
  if (!job) throw new Error('任务不存在');

  let progress = JSON.parse(job.progress || '[]');
  
  try {
    // Step 1: OCR / 文本提取
    progress = updateStepStatus(progress, 'ocr', 'processing');
    db.updateJob(jobId, { status: 'ocr', progress: JSON.stringify(progress) });

    let allText = '';
    for (const fileInfo of filePaths) {
      const text = await extractText(fileInfo.path, fileInfo.mimetype);
      allText += `\n=== ${fileInfo.originalName} ===\n${text}\n`;
    }
    
    progress = updateStepStatus(progress, 'ocr', 'completed');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    // Step 2: LLM 结构化抽取
    progress = updateStepStatus(progress, 'llm', 'processing');
    db.updateJob(jobId, { status: 'llm_extract', progress: JSON.stringify(progress) });

    const sourceFiles = filePaths.map(f => f.originalName);
    const extractedData = await extractElderInfo(allText, sourceFiles);
    
    progress = updateStepStatus(progress, 'llm', 'completed');
    progress = updateStepStatus(progress, 'extracted', 'completed');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    // Step 3: 创建或更新长者档案
    let elder;
    if (elderId) {
      // 补充材料到已有长者
      console.log(`[Pipeline] 补充模式：更新现有长者 ${elderId}`);
      elder = db.getElderById(elderId);
      if (!elder) throw new Error('长者档案不存在');
      
      // 合并 extracted_data
      const existingData = JSON.parse(elder.extracted_data_json || '{}');
      const mergedData = mergeExtractedData(existingData, extractedData);
      
      db.updateElder(elderId, {
        extracted_data: mergedData,
        assessment_date: new Date().toISOString().split('T')[0]
      });
    } else {
      // 新建长者
      console.log('[Pipeline] 新建模式：創建新長者檔案');
      const basic = extractedData.basic_info || {};
      elder = db.createElder({
        name: basic.name || `長者_${new Date().toISOString().slice(0, 10)}`,
        age: basic.age || null,
        gender: basic.gender || '',
        address: basic.address || '',
        phone: basic.phone || '',
        id_number: basic.id_number || '',
        emergency_contact_name: basic.emergency_contact?.name || '',
        emergency_contact_relation: basic.emergency_contact?.relation || '',
        emergency_contact_phone: basic.emergency_contact?.phone || '',
        district: basic.district || '',
        extracted_data: extractedData,
        assessment_date: new Date().toISOString().split('T')[0],
        is_pending_ai_review: 1
      });
      elderId = elder.id;
    }

    // 保存材料记录
    for (const fileInfo of filePaths) {
      db.createMaterial({
        elder_id: elderId,
        file_name: fileInfo.originalName,
        file_type: fileInfo.mimetype || '',
        file_size: fileInfo.size || 0,
        file_path: fileInfo.path || '',
        extracted_data: extractedData,
        status: 'completed'
      });
    }

    // Step 4: 慢病判断
    progress = updateStepStatus(progress, 'chronic', 'processing');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    const chronicDetails = evaluateChronicDiseases(extractedData);
    db.saveChronicDiseaseDetails(elderId, chronicDetails);
    
    const healthTags = getChronicDiseaseTags(chronicDetails);
    
    progress = updateStepStatus(progress, 'chronic', 'completed');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    // Step 5: 风险评分
    progress = updateStepStatus(progress, 'risk', 'processing');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    const riskResult = evaluateRisk(extractedData, chronicDetails);
    db.saveRiskDimensions(elderId, riskResult.dimensions);
    
    progress = updateStepStatus(progress, 'risk', 'completed');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    // Step 6: 综合风险判断
    progress = updateStepStatus(progress, 'comprehensive', 'processing');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    // 更新长者档案
    const riskLevelMap = { high: 'high', medium: 'medium', low: 'low' };
    
    db.updateElder(elderId, {
      risk_level: riskLevelMap[riskResult.overall_risk] || 'pending',
      overall_risk_level: riskResult.overall_risk,
      health_tags: healthTags
    });
    
    progress = updateStepStatus(progress, 'comprehensive', 'completed');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    // Step 7: 生成建议
    progress = updateStepStatus(progress, 'recommendations', 'processing');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    const recommendations = matchRecommendations(extractedData, chronicDetails, riskResult);
    db.saveRecommendations(elderId, recommendations);
    
    // 匹配资源
    const elderData = db.getElderById(elderId);
    const resources = matchResources(elderData, chronicDetails, riskResult);
    db.saveResourceRecommendations(elderId, resources);
    
    progress = updateStepStatus(progress, 'recommendations', 'completed');
    db.updateJob(jobId, { progress: JSON.stringify(progress) });

    // Step 8: 生成摘要
    const summary = await generateSummary(extractedData, chronicDetails, riskResult);
    db.updateElder(elderId, { summary_text: summary });

    // 完成
    progress = updateStepStatus(progress, 'completed', 'completed');
    db.updateJob(jobId, { 
      status: 'completed', 
      elder_id: elderId,
      progress: JSON.stringify(progress) 
    });

    return {
      jobId,
      elderId,
      status: 'completed',
      summary: {
        name: elder.name,
        chronic_count: healthTags.length,
        health_tags: healthTags,
        risk_level: riskResult.overall_risk,
        summary_text: summary
      }
    };

  } catch (error) {
    console.error('[Pipeline] 处理失败:', error);
    
    // 标记失败的步骤
    const failedStep = PIPELINE_STEPS.find(s => 
      progress.find(p => p.key === s.key)?.status === 'processing'
    );
    if (failedStep) {
      progress = updateStepStatus(progress, failedStep.key, 'failed');
    }
    
    db.updateJob(jobId, {
      status: 'failed',
      progress: JSON.stringify(progress),
      error_message: error.message
    });
    
    throw error;
  }
}

function updateStepStatus(progress, stepKey, status) {
  return progress.map(step => 
    step.key === stepKey ? { ...step, status } : step
  );
}

// 合并已有的 extracted_data 和新抽取的数据
function mergeExtractedData(existing, newData) {
  const merged = {
    basic_info: { ...existing.basic_info, ...newData.basic_info },
    medical_facts: [...(existing.medical_facts || []), ...(newData.medical_facts || [])],
    function_facts: {
      fall_history: [...(existing.function_facts?.fall_history || []), ...(newData.function_facts?.fall_history || [])],
      mobility: [...(existing.function_facts?.mobility || []), ...(newData.function_facts?.mobility || [])],
      daily_living: [...(existing.function_facts?.daily_living || []), ...(newData.function_facts?.daily_living || [])],
      cognition_communication: [...(existing.function_facts?.cognition_communication || []), ...(newData.function_facts?.cognition_communication || [])],
      social_support: [...(existing.function_facts?.social_support || []), ...(newData.function_facts?.social_support || [])]
    },
    missing_information: [...new Set([...(existing.missing_information || []), ...(newData.missing_information || [])])],
    source_files: [...(existing.source_files || []), ...(newData.source_files || [])]
  };
  
  return merged;
}

module.exports = {
  processUpload,
  PIPELINE_STEPS,
  createInitialProgress
};
