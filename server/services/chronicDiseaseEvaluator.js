// 慢病判断引擎
// 基于 chronic_disease_dictionary.json + chronic_disease_rules.json + chronic_disease_rules_by_disease.json
// 从 extracted_data 中判断慢病状态
const { getRule } = require('./ruleLoader');

const DISEASE_LIST = [
  { id: 'DM', name: '糖尿病', name_zh_hk: '糖尿病', category: '代谢' },
  { id: 'HTN', name: '高血壓', name_zh_hk: '高血壓', category: '心血管' },
  { id: 'HLD', name: '高血脂/血脂異常', name_zh_hk: '高血脂/血脂異常', category: '心血管' },
  { id: 'CHD', name: '冠心病/心梗/心絞痛', name_zh_hk: '冠心病/心梗/心絞痛', category: '心血管' },
  { id: 'STROKE', name: '中風', name_zh_hk: '中風', category: '脑血管' },
  { id: 'CKD', name: '慢性腎病', name_zh_hk: '慢性腎病', category: '肾脏' },
  { id: 'COPD', name: '慢阻肺', name_zh_hk: '慢阻肺', category: '呼吸' },
  { id: 'ASTHMA', name: '哮喘', name_zh_hk: '哮喘', category: '呼吸' },
  { id: 'HF', name: '心力衰竭', name_zh_hk: '心力衰竭', category: '心血管' },
  { id: 'AF', name: '房顫/心律失常', name_zh_hk: '房顫/心律失常', category: '心血管' },
  { id: 'OSTEO', name: '骨質疏鬆/骨折史', name_zh_hk: '骨質疏鬆/骨折史', category: '骨骼' },
  { id: 'DEM', name: '失智症/認知障礙', name_zh_hk: '失智症/認知障礙', category: '神经' },
  { id: 'DEP', name: '抑鬱/焦慮記錄', name_zh_hk: '抑鬱/焦慮記錄', category: '精神' },
  { id: 'CANCER', name: '癌症史', name_zh_hk: '癌症史', category: '肿瘤' },
  { id: 'GOUT', name: '痛風/高尿酸', name_zh_hk: '痛風/高尿酸', category: '代谢' },
  { id: 'LD', name: '慢性肝病', name_zh_hk: '慢性肝病', category: '消化' }
];

const DISEASE_NAME_MAP = {};
DISEASE_LIST.forEach(d => { DISEASE_NAME_MAP[d.id] = d; });

// 从 extracted_data 中收集所有医学事实
function collectMedicalFacts(extractedData) {
  const facts = [];
  if (!extractedData) return facts;

  // 从 medical_facts 收集
  if (Array.isArray(extractedData.medical_facts)) {
    facts.push(...extractedData.medical_facts.map(f => ({ ...f, source_type: 'medical_facts' })));
  }
  
  // 从 function_facts 收集
  if (extractedData.function_facts) {
    const ff = extractedData.function_facts;
    for (const [key, items] of Object.entries(ff)) {
      if (Array.isArray(items)) {
        facts.push(...items.map(item => ({
          ...(typeof item === 'string' ? { name: item, type: key } : item),
          source_type: 'function_facts'
        })));
      }
    }
  }
  
  return facts;
}

// 获取疾病的关键词列表（从规则库）
function getDiseaseKeywords(diseaseId) {
  const rules = getRule('chronic_disease_rules');
  const dict = getRule('chronic_disease_dictionary');
  const byDisease = getRule('chronic_disease_rules_by_disease');
  
  const keywords = new Set();
  
  // 从 dictionary 获取名称和繁体别名
  if (dict && Array.isArray(dict)) {
    const entry = dict.find(d => d.disease_id === diseaseId);
    if (entry) {
      if (entry.disease_name) keywords.add(entry.disease_name.toLowerCase());
      if (entry.disease_name_traditional) keywords.add(entry.disease_name_traditional.toLowerCase());
      if (entry.aliases && Array.isArray(entry.aliases)) {
        entry.aliases.forEach(a => keywords.add(a.toLowerCase()));
      }
    }
  }
  
  // 从规则中获取所有关键词（含繁简体）
  function collectRuleKeywords(ruleList) {
    for (const r of ruleList) {
      if (r.disease_id === diseaseId || (r.disease && r.disease.disease_id === diseaseId)) {
        const rData = r.disease ? r : r;
        for (const field of ['keywords', 'symptom_keywords']) {
          if (Array.isArray(rData[field])) {
            rData[field].forEach(k => keywords.add(k.toLowerCase()));
          }
        }
      }
    }
  }
  
  if (rules && rules.rules) collectRuleKeywords(rules.rules);
  if (byDisease && byDisease.rules_by_disease && byDisease.rules_by_disease[diseaseId]) {
    const dr = byDisease.rules_by_disease[diseaseId];
    if (dr.rules) collectRuleKeywords(dr.rules);
  }
  
  return Array.from(keywords);
}

// 获取疾病的药物关键词
function getDiseaseDrugKeywords(diseaseId) {
  const rules = getRule('chronic_disease_rules');
  const byDisease = getRule('chronic_disease_rules_by_disease');
  const keywords = [];
  
  function collectMeds(ruleList) {
    for (const r of ruleList) {
      if (r.disease_id === diseaseId) {
        for (const field of ['medication_keywords', 'drug_keywords']) {
          if (Array.isArray(r[field])) {
            keywords.push(...r[field]);
          }
        }
      }
    }
  }
  
  if (rules && rules.rules) collectMeds(rules.rules);
  if (byDisease && byDisease.rules_by_disease && byDisease.rules_by_disease[diseaseId]) {
    if (byDisease.rules_by_disease[diseaseId].rules) {
      collectMeds(byDisease.rules_by_disease[diseaseId].rules);
    }
  }
  
  return [...new Set(keywords.map(k => k.toLowerCase()))];
}

// 获取疾病的 condition_type（量化指标类型）
function getDiseaseConditionType(diseaseId) {
  const rules = getRule('chronic_disease_rules');
  if (rules && rules.rules) {
    for (const r of rules.rules) {
      if (r.disease_id === diseaseId && r.condition_type && r.evidence_level === 'C') {
        return r.condition_type;
      }
    }
  }
  return null;
}

// 尝试从数值字符串中提取数字
function extractNumericValue(valueStr) {
  if (!valueStr) return null;
  const s = String(valueStr).replace(/[^\d./\\-]/g, '').trim();
  // 尝试解析如 "150/95" 这样的分数
  if (s.includes('/')) {
    const parts = s.split('/');
    const nums = parts.map(p => parseFloat(p)).filter(n => !isNaN(n));
    return nums.length > 0 ? nums : null;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : [n];
}

// 根据 numeric_thresholds 判断化验值是否异常
function checkLabValueAgainstThreshold(fact, diseaseId) {
  const conditionType = getDiseaseConditionType(diseaseId);
  if (!conditionType) return null;
  
  const rules = getRule('chronic_disease_rules');
  const thresholds = rules && rules.numeric_thresholds && rules.numeric_thresholds.thresholds;
  if (!thresholds || !thresholds[conditionType]) return null;
  
  const thresholdDef = thresholds[conditionType];
  const factName = ((fact.name || '') + ' ' + (fact.evidence_text || '')).toLowerCase();
  const factValue = fact.value || '';
  
  for (const param of thresholdDef.parameters) {
    // 检查 fact 名称是否匹配参数的 aliases
    const matched = param.aliases.some(alias => factName.includes(alias.toLowerCase()));
    if (!matched) continue;
    
    const nums = extractNumericValue(factValue);
    if (!nums) continue;
    
    // 特殊处理血压（含收缩压和舒张压）
    if (conditionType === 'bp_single_or_repeated_high') {
      const sbp = nums[0];
      const dbp = nums.length > 1 ? nums[1] : null;
      if (param.key === 'sbp' && sbp >= param.threshold) {
        return { condition_type: conditionType, param: 'sbp', value: sbp, threshold: param.threshold, unit: param.unit, severity: getBpSeverity(sbp, dbp, thresholdDef) };
      }
      if (param.key === 'dbp' && dbp !== null && dbp >= param.threshold) {
        return { condition_type: conditionType, param: 'dbp', value: dbp, threshold: param.threshold, unit: param.unit, severity: getBpSeverity(nums[0], dbp, thresholdDef) };
      }
      continue;
    }
    
    const val = nums[0];
    const op = param.operator;
    let threshold = param.threshold;
    
    // 处理性别相关阈值
    if (param.threshold_male !== undefined) {
      threshold = param.threshold_male; // 默认用男性，此处简化
    }
    
    let isAbnormal = false;
    if (op === '>=' || op === '>') isAbnormal = val >= (op === '>=' ? threshold : threshold);
    else if (op === '<') isAbnormal = val < threshold;
    else if (op === 'eq' && param.threshold === 'positive') {
      isAbnormal = factValue.toLowerCase().includes('positive') || factValue.toLowerCase().includes('阳性') || factValue.toLowerCase().includes('陽性');
    }
    
    if (isAbnormal) {
      return { condition_type: conditionType, param: param.key, value: val, threshold: threshold, unit: param.unit };
    }
  }
  
  return null;
}

function getBpSeverity(sbp, dbp, thresholdDef) {
  const severity = thresholdDef.severity;
  if (!severity) return null;
  if (sbp >= (severity.grade_3?.sbp_min || 180) || (dbp !== null && dbp >= (severity.grade_3?.dbp_min || 110))) {
    return severity.grade_3?.label || '三级高血压';
  }
  if (sbp >= (severity.grade_2?.sbp_range?.[0] || 160) || (dbp !== null && dbp >= (severity.grade_2?.dbp_range?.[0] || 100))) {
    return severity.grade_2?.label || '二级高血压';
  }
  return severity.grade_1?.label || '一级高血压';
}

// 简单模糊匹配：检查两个字符串是否有足够重叠
function fuzzyMatch(str1, str2, threshold = 0.6) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  if (s1.includes(s2) || s2.includes(s1)) return true;
  
  // 计算字符级重叠度
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  let overlap = 0;
  set1.forEach(c => { if (set2.has(c)) overlap++; });
  const similarity = overlap / Math.max(set1.size, set2.size);
  return similarity >= threshold;
}

// 匹配事实与疾病（增强版：关键词匹配 + 模糊匹配 + 量化阈值）
function matchFactsToDisease(facts, diseaseId) {
  const keywords = getDiseaseKeywords(diseaseId);
  const drugKeywords = getDiseaseDrugKeywords(diseaseId);
  
  const matched = [];
  const lowerFacts = facts.map(f => ({
    ...f,
    name_lower: (f.name || '').toLowerCase(),
    value_lower: (f.value || '').toLowerCase(),
    evidence_lower: (f.evidence_text || '').toLowerCase()
  }));
  
  for (const fact of lowerFacts) {
    let matchType = null;
    let matchStrength = 0;
    
    // 预处理：构建所有可搜索文本
    const searchText = [fact.name_lower, fact.evidence_lower, fact.value_lower].filter(Boolean).join(' ');
    
    // 检查是否是明确的诊断记录
    if (fact.type === 'diagnosis' || fact.type === 'visit_record') {
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        if (searchText.includes(kwLower)) {
          matchType = 'diagnosis';
          matchStrength = 3;
          break;
        }
      }
      // 模糊匹配降级
      if (!matchType) {
        for (const kw of keywords) {
          if (fuzzyMatch(searchText, kw, 0.7)) {
            matchType = 'diagnosis';
            matchStrength = 2;
            break;
          }
        }
      }
    }
    
    // 检查是否是检查指标（含量化阈值判断）
    if (!matchType && (fact.type === 'lab_result' || fact.type === 'vital_sign')) {
      // 先尝试量化阈值匹配
      const thresholdResult = checkLabValueAgainstThreshold(fact, diseaseId);
      if (thresholdResult) {
        matchType = 'lab_result';
        matchStrength = 2.5;
        fact._threshold_check = thresholdResult;
      }
      
      // 如果阈值不匹配，尝试关键词匹配
      if (!matchType) {
        for (const kw of keywords) {
          const kwLower = kw.toLowerCase();
          if (searchText.includes(kwLower)) {
            matchType = 'lab_result';
            matchStrength = 2;
            break;
          }
        }
        // 模糊匹配降级
        if (!matchType) {
          for (const kw of keywords) {
            if (fuzzyMatch(searchText, kw, 0.65)) {
              matchType = 'lab_result';
              matchStrength = 1.5;
              break;
            }
          }
        }
      }
      // 也检查药物
      if (!matchType) {
        for (const dk of drugKeywords) {
          const dkLower = dk.toLowerCase();
          if (searchText.includes(dkLower)) {
            matchType = 'medication';
            matchStrength = 2;
            break;
          }
        }
        if (!matchType) {
          for (const dk of drugKeywords) {
            if (fuzzyMatch(searchText, dk, 0.7)) {
              matchType = 'medication';
              matchStrength = 1.5;
              break;
            }
          }
        }
      }
    }
    
    // 检查是否是药物线索
    if (!matchType && (fact.type === 'medication')) {
      for (const dk of drugKeywords) {
        const dkLower = dk.toLowerCase();
        if (searchText.includes(dkLower)) {
          matchType = 'medication';
          matchStrength = 1.5;
          break;
        }
      }
      if (!matchType) {
        for (const dk of drugKeywords) {
          if (fuzzyMatch(searchText, dk, 0.7)) {
            matchType = 'medication';
            matchStrength = 1;
            break;
          }
        }
      }
    }
    
    // 检查是否是自述/症状
    if (!matchType && (fact.type === 'self_report' || fact.type === 'symptom')) {
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        if (searchText.includes(kwLower)) {
          matchType = fact.type;
          matchStrength = fact.type === 'self_report' ? 1 : 0.5;
          break;
        }
      }
      if (!matchType) {
        for (const kw of keywords) {
          if (fuzzyMatch(searchText, kw, 0.7)) {
            matchType = fact.type;
            matchStrength = fact.type === 'self_report' ? 0.8 : 0.3;
            break;
          }
        }
      }
    }
    
    if (matchType) {
      matched.push({ ...fact, match_type: matchType, match_strength: matchStrength });
    }
  }
  
  return matched;
}

// 确定慢病状态
function determineDiseaseStatus(matchedFacts) {
  if (matchedFacts.length === 0) return { status: 'not_found', evidence_level: 'N/A' };
  
  const hasDiagnosis = matchedFacts.some(f => f.match_type === 'diagnosis');
  const hasLabResult = matchedFacts.some(f => f.match_type === 'lab_result');
  const hasMedication = matchedFacts.some(f => f.match_type === 'medication');
  const hasSelfReport = matchedFacts.some(f => f.match_type === 'self_report');
  const hasSymptom = matchedFacts.some(f => f.match_type === 'symptom');
  
  if (hasDiagnosis) return { status: 'confirmed', evidence_level: 'A' };
  if (hasLabResult) return { status: 'indicator_abnormal', evidence_level: 'C' };
  if (hasMedication) return { status: 'pending_clue', evidence_level: 'C' };
  if (hasSelfReport) return { status: 'self_reported', evidence_level: 'B' };
  if (hasSymptom) return { status: 'pending_clue', evidence_level: 'D' };
  
  return { status: 'not_found', evidence_level: 'N/A' };
}

// 主评估函数
function evaluateChronicDiseases(extractedData) {
  const facts = collectMedicalFacts(extractedData);
  const results = [];
  
  for (const disease of DISEASE_LIST) {
    const matched = matchFactsToDisease(facts, disease.id);
    const { status, evidence_level } = determineDiseaseStatus(matched);
    
    // 判断是否计入慢病数量
    const countedAsChronic = ['confirmed', 'self_reported'].includes(status);
    
    // 生成依据文本
    let evidence = '';
    if (matched.length > 0) {
      evidence = matched.map(f => {
        const name = f.name || '未命名';
        const src = f.source || '未知来源';
        const date = f.date || '';
        let extra = '';
        if (f._threshold_check) {
          const tc = f._threshold_check;
          extra = ` (${tc.param}=${tc.value} ${tc.unit || ''}，閾值${tc.threshold}${tc.severity ? '，' + tc.severity : ''})`;
        }
        return `[${f.match_type}] ${name}${extra}${date ? ' (' + date + ')' : ''} | 来源: ${src}`;
      }).join('; ');
    } else {
      evidence = '未发现相关证据';
    }
    
    // AI 识别摘要
    let aiResult = '';
    if (status === 'confirmed') aiResult = `已确診${disease.name}（診斷記錄）`;
    else if (status === 'self_reported') aiResult = `長者自述有${disease.name}，待文件確認`;
    else if (status === 'indicator_abnormal') aiResult = `相關指標異常，${disease.name}需進一步確認`;
    else if (status === 'pending_clue') aiResult = `發現${disease.name}相關線索，需追問`;
    else aiResult = `未發現${disease.name}相關證據`;
    
    results.push({
      disease_id: disease.id,
      disease_name: disease.name,
      category: disease.category,
      ai_result: aiResult,
      evidence: evidence,
      evidence_level: evidence_level,
      source: matched.length > 0 ? (matched[0].source || 'upload') : 'N/A',
      status: status,
      counted_as_chronic: countedAsChronic,
      confidence: matched.length > 0 ? Math.min(matched.length * 0.3, 1) : 0
    });
  }
  
  return results;
}

// 获取计入慢病数量的慢病标签列表
function getChronicDiseaseTags(chronicDetails) {
  return chronicDetails
    .filter(d => d.counted_as_chronic)
    .map(d => d.disease_name);
}

// 获取慢病计数
function getChronicDiseaseCount(chronicDetails) {
  return chronicDetails.filter(d => d.counted_as_chronic).length;
}

module.exports = {
  evaluateChronicDiseases,
  getChronicDiseaseTags,
  getChronicDiseaseCount,
  DISEASE_LIST
};
