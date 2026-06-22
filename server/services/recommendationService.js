// AI 建议匹配引擎
// 基于 ai_recommendation_library.json
// 根据风险维度、慢病状态、缺失资料、红旗触发结果生成建议
const { getRule } = require('./ruleLoader');

function matchRecommendations(extractedData, chronicDetails, riskResult) {
  const recommendations = [];
  const arl = getRule('ai_recommendation_library');
  
  if (!arl || !arl.recommendation_rules) {
    return generateDefaultRecommendations(chronicDetails, riskResult);
  }
  
  const features = extractMatchingFeatures(extractedData, chronicDetails, riskResult);
  
  for (const rule of arl.recommendation_rules) {
    if (matchConditions(rule.conditions, features)) {
      const content = formatRecommendationContent(rule, features);
      recommendations.push({
        type: 'social_worker',
        dimension: rule.dimension || '',
        content: content,
        source: 'ai_recommendation_library',
        matched_rule_id: rule.rule_id || ''
      });
    }
  }
  
  // 如果没有匹配到规则，生成默认建议
  if (recommendations.length === 0) {
    return generateDefaultRecommendations(chronicDetails, riskResult);
  }
  
  return recommendations;
}

function extractMatchingFeatures(extractedData, chronicDetails, riskResult) {
  const features = {
    chronic_diseases: [],
    chronic_count: 0,
    fall_history: false,
    lives_alone: false,
    cognitive_decline: false,
    adl_limited: false,
    social_isolated: false,
    high_dimensions: [],
    medium_dimensions: [],
    red_flags: []
  };
  
  if (chronicDetails) {
    features.chronic_diseases = chronicDetails
      .filter(d => d.counted_as_chronic)
      .map(d => d.disease_name);
    features.chronic_count = features.chronic_diseases.length;
  }
  
  if (extractedData) {
    const basic = extractedData.basic_info || {};
    features.lives_alone = (basic.living_arrangement || '').includes('独居') || 
                           (basic.living_arrangement || '').includes('獨居');
    
    if (extractedData.function_facts) {
      const ff = extractedData.function_facts;
      features.fall_history = Array.isArray(ff.fall_history) && ff.fall_history.length > 0;
      
      if (Array.isArray(ff.cognition_communication)) {
        features.cognitive_decline = ff.cognition_communication.some(c => {
          const txt = (typeof c === 'string' ? c : (c.name || c.description || '')).toLowerCase();
          return txt.includes('記憶') || txt.includes('認知') || txt.includes('忘記');
        });
      }
      
      if (Array.isArray(ff.daily_living)) {
        features.adl_limited = ff.daily_living.some(d => {
          const txt = (typeof d === 'string' ? d : (d.name || d.description || '')).toLowerCase();
          return txt.includes('困難') || txt.includes('協助') || txt.includes('無法');
        });
      }
      
      if (Array.isArray(ff.social_support)) {
        features.social_isolated = ff.social_support.some(s => {
          const txt = (typeof s === 'string' ? s : (s.name || s.description || '')).toLowerCase();
          return txt.includes('孤立') || txt.includes('獨居') || txt.includes('缺乏');
        });
      }
    }
  }
  
  if (riskResult) {
    if (riskResult.dimensions) {
      features.high_dimensions = riskResult.dimensions.filter(d => d.riskLevel === 'high').map(d => d.dimension_name);
      features.medium_dimensions = riskResult.dimensions.filter(d => d.riskLevel === 'medium').map(d => d.dimension_name);
    }
    if (riskResult.red_flags) {
      features.red_flags = riskResult.red_flags.map(f => f.rule || '');
    }
  }
  
  return features;
}

function matchConditions(conditions, features) {
  if (!conditions || conditions.length === 0) return false;
  
  for (const cond of conditions) {
    if (!cond.field) continue;
    
    const key = cond.field;
    const op = cond.operator || '==';
    const value = cond.value;
    
    const featureValue = features[key];
    
    switch (op) {
      case '==':
        if (featureValue !== value) return false;
        break;
      case '!=':
        if (featureValue === value) return false;
        break;
      case '>':
        if (!(Number(featureValue) > Number(value))) return false;
        break;
      case '<':
        if (!(Number(featureValue) < Number(value))) return false;
        break;
      case '>=':
        if (!(Number(featureValue) >= Number(value))) return false;
        break;
      case '<=':
        if (!(Number(featureValue) <= Number(value))) return false;
        break;
      case 'in':
      case 'includes':
        if (!Array.isArray(featureValue) || !featureValue.includes(value)) return false;
        break;
      case 'contains':
        if (typeof featureValue !== 'string' || !featureValue.includes(String(value))) return false;
        break;
      case 'any':
        if (!Array.isArray(featureValue) || featureValue.length === 0) return false;
        break;
      case 'true':
        if (!featureValue) return false;
        break;
      case 'false':
        if (featureValue) return false;
        break;
      default:
        break;
    }
  }
  
  return true;
}

function formatRecommendationContent(rule, features) {
  let content = rule.recommendation || rule.content || '';
  
  // 变量替换
  if (content.includes('{') && rule.template_id) {
    const arl = getRule('ai_recommendation_library');
    if (arl && arl.template_library) {
      const template = arl.template_library.find(t => t.template_id === rule.template_id);
      if (template) {
        content = template.content_zh || template.content || content;
      }
    }
  }
  
  return content;
}

function generateDefaultRecommendations(chronicDetails, riskResult) {
  const recommendations = [];
  
  // 基于慢病生成建议
  if (chronicDetails) {
    const confirmedDiseases = chronicDetails.filter(d => d.counted_as_chronic);
    if (confirmedDiseases.length >= 2) {
      recommendations.push({
        type: 'social_worker',
        dimension: '慢性病管理',
        content: `長者有${confirmedDiseases.length}種已確認慢病（${confirmedDiseases.map(d => d.disease_name).join('、')}），建議安排個案經理跟進慢病管理，協調各科覆診及藥物管理。`,
        source: 'default',
        matched_rule_id: 'default_multi_chronic'
      });
    } else if (confirmedDiseases.length === 1) {
      recommendations.push({
        type: 'social_worker',
        dimension: '慢性病管理',
        content: `長者確診${confirmedDiseases[0].disease_name}，建議定期跟進用藥及覆診情況。`,
        source: 'default',
        matched_rule_id: 'default_single_chronic'
      });
    }
  }
  
  // 基于风险维度生成建议
  if (riskResult && riskResult.dimensions) {
    for (const dim of riskResult.dimensions) {
      if (dim.riskLevel === 'high') {
        const suggestion = getDimensionSuggestion(dim.dimension_name);
        recommendations.push({
          type: 'social_worker',
          dimension: dim.dimension_name,
          content: suggestion,
          source: 'default',
          matched_rule_id: `default_high_${dim.dimension_key}`
        });
      }
    }
  }
  
  return recommendations;
}

function getDimensionSuggestion(dimName) {
  const suggestions = {
    '慢病管理': '長者慢病管理風險較高，建議協助安排定期覆診、檢視用藥清單，並考慮轉介至地區康健中心進行慢病自我管理教育。',
    '跌倒行動': '長者跌倒風險較高，建議安排家居安全評估（檢查照明、地面防滑、扶手安裝），並考慮轉介物理治療師進行平衡訓練。',
    '生活能力': '長者日常生活能力受限，建議轉介家居照顧服務（備餐、清潔、個人護理），並評估是否需要申請長期護理服務。',
    '認知溝通': '長者認知溝通能力需關注，建議安排認知功能評估（如HK-MoCA），並考慮轉介至記憶診所或日間護理中心。',
    '社會支持': '長者社會支持薄弱，建議連結社區資源（長者地區中心、鄰舍關懷計劃），安排義工定期探訪及電話慰問。'
  };
  return suggestions[dimName] || `建議社工跟進${dimName}相關風險。`;
}

// 生成一页通报告用的家属友好建议
function generateFamilyFriendlyRecommendations(recommendations, chronicDetails, riskResult) {
  const familyRecs = [];
  
  for (const rec of recommendations) {
    // 转换为温和表达
    let friendlyText = rec.content
      .replace(/高風險/g, '需要優先關注')
      .replace(/中風險/g, '建議持續留意')
      .replace(/低風險/g, '目前情況相對穩定')
      .replace(/風險較高/g, '需要優先關注')
      .replace(/建議社工/g, '建議家屬')
      .replace(/安排/g, '協助安排');
    
    familyRecs.push({
      dimension: rec.dimension,
      content: friendlyText
    });
  }
  
  return familyRecs;
}

module.exports = {
  matchRecommendations,
  generateFamilyFriendlyRecommendations
};
