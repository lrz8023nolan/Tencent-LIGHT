// JSON 规则库加载与校验模块
const fs = require('fs');
const path = require('path');

// 默认规则库路径配置
const RULES_DIR = process.env.RULES_DIR || path.join(__dirname, '..', 'rules');

const REQUIRED_FILES = [
  'ai_recommendation_library.json',
  'chronic_disease_dictionary.json',
  'chronic_disease_rules.json',
  'chronic_disease_rules_by_disease.json',
  'regional_resource_database.json',
  'risk_scoring_rules.json'
];

let ruleCache = {};
let loadErrors = [];

function loadRuleFile(filename) {
  const filePath = path.join(RULES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    const err = `[规则库] 缺失文件: ${filePath}`;
    loadErrors.push(err);
    console.error(err);
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    console.log(`[规则库] 已加载: ${filename}`);
    return data;
  } catch (e) {
    const err = `[规则库] 解析失败 ${filename}: ${e.message}`;
    loadErrors.push(err);
    console.error(err);
    return null;
  }
}

function loadAllRules() {
  ruleCache = {};
  loadErrors = [];
  
  console.log('[规则库] 开始加载 JSON 规则库...');
  
  for (const file of REQUIRED_FILES) {
    const key = file.replace('.json', '');
    ruleCache[key] = loadRuleFile(file);
  }
  
  const missingFiles = REQUIRED_FILES.filter(f => !ruleCache[f.replace('.json', '')]);
  
  if (missingFiles.length > 0) {
    console.error(`[规则库] ❌ 警告: 以下规则库文件缺失: ${missingFiles.join(', ')}`);
    console.error('[规则库] 系统将尝试继续运行，但相关功能可能不可用。');
    console.error('[规则库] 请确保将以下文件放入 ' + RULES_DIR + ' 目录:');
    missingFiles.forEach(f => console.error(`  - ${f}`));
  }
  
  // 基本 schema 校验
  validateSchemas();
  
  return {
    success: loadErrors.length === 0,
    loaded: Object.keys(ruleCache).filter(k => ruleCache[k] !== null),
    missing: REQUIRED_FILES.filter(f => !ruleCache[f.replace('.json', '')]),
    errors: loadErrors
  };
}

function validateSchemas() {
  // chronic_disease_dictionary 校验
  if (ruleCache.chronic_disease_dictionary) {
    const dict = ruleCache.chronic_disease_dictionary;
    if (!Array.isArray(dict)) {
      loadErrors.push('chronic_disease_dictionary: 期望为数组格式');
    }
  }
  
  // chronic_disease_rules 校验
  if (ruleCache.chronic_disease_rules) {
    const rules = ruleCache.chronic_disease_rules;
    if (!rules.diseases && !rules.rules) {
      loadErrors.push('chronic_disease_rules: 缺少 diseases 或 rules 字段');
    }
  }
  
  // risk_scoring_rules 校验
  if (ruleCache.risk_scoring_rules) {
    const rsr = ruleCache.risk_scoring_rules;
    if (!rsr.dimensions) {
      loadErrors.push('risk_scoring_rules: 缺少 dimensions 字段');
    }
    if (!rsr.overall_risk_rules) {
      loadErrors.push('risk_scoring_rules: 缺少 overall_risk_rules 字段');
    }
  }
  
  // ai_recommendation_library 校验
  if (ruleCache.ai_recommendation_library) {
    const arl = ruleCache.ai_recommendation_library;
    if (!arl.recommendation_rules && !arl.template_library) {
      loadErrors.push('ai_recommendation_library: 缺少 recommendation_rules 或 template_library 字段');
    }
  }
  
  // regional_resource_database 校验
  if (ruleCache.regional_resource_database) {
    const rrd = ruleCache.regional_resource_database;
    if (!Array.isArray(rrd)) {
      loadErrors.push('regional_resource_database: 期望为数组格式');
    }
  }

  // chronic_disease_rules_by_disease 校验
  if (ruleCache.chronic_disease_rules_by_disease) {
    const rbd = ruleCache.chronic_disease_rules_by_disease;
    if (!rbd.rules_by_disease) {
      loadErrors.push('chronic_disease_rules_by_disease: 缺少 rules_by_disease 字段');
    }
  }
}

function getRule(key) {
  return ruleCache[key] || null;
}

function getAllRules() {
  return { ...ruleCache };
}

function reloadRules() {
  console.log('[规则库] 重新加载规则库...');
  return loadAllRules();
}

function getStatus() {
  return {
    rulesDir: RULES_DIR,
    loaded: Object.keys(ruleCache).filter(k => ruleCache[k] !== null),
    missing: REQUIRED_FILES.filter(f => !ruleCache[f.replace('.json', '')]),
    errors: loadErrors,
    allLoaded: loadErrors.length === 0
  };
}

module.exports = {
  loadAllRules,
  getRule,
  getAllRules,
  reloadRules,
  getStatus,
  RULES_DIR,
  REQUIRED_FILES
};
