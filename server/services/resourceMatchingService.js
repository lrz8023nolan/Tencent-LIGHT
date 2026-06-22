// 地区资源匹配引擎
// 基于 regional_resource_database.json
// 根据长者地区、健康标签、风险维度匹配社区资源
const { getRule } = require('./ruleLoader');

function matchResources(elderData, chronicDetails, riskResult) {
  const rrd = getRule('regional_resource_database');
  if (!rrd || !Array.isArray(rrd) || rrd.length === 0) {
    return [];
  }
  
  const district = elderData.district || extractDistrict(elderData.address || '');
  const healthTags = parseHealthTags(elderData.health_tags);
  const riskDimensions = riskResult ? riskResult.dimensions || [] : [];
  
  const results = [];
  
  for (const resource of rrd) {
    let matchScore = 0;
    const matchReasons = [];
    
    // 地区匹配（权重最高）
    if (resource.district && district && resource.district.includes(district)) {
      matchScore += 3;
      matchReasons.push(`地區匹配：${resource.district}`);
    } else if (resource.district && district) {
      // 相邻地区也给予一定权重
      matchScore += 1;
      matchReasons.push(`鄰近地區：${resource.district}`);
    }
    
    // 触发标签匹配
    if (resource.recommended_trigger_tags && Array.isArray(resource.recommended_trigger_tags)) {
      for (const tag of resource.recommended_trigger_tags) {
        if (healthTags.includes(tag)) {
          matchScore += 1;
          matchReasons.push(`健康標籤匹配：${tag}`);
        }
      }
    }
    
    // 资源类型与风险维度匹配
    if (resource.resource_type) {
      const type = resource.resource_type;
      const highDims = riskDimensions.filter(d => d.riskLevel === 'high').map(d => d.dimension_name);
      
      if (type.includes('DHC') || type.includes('Health Centre')) {
        if (highDims.includes('慢病管理')) { matchScore += 1; matchReasons.push('慢病管理需求匹配'); }
      }
      if (type.includes('Elderly')) {
        if (highDims.includes('社會支持') || highDims.includes('生活能力')) { matchScore += 1; matchReasons.push('長者服務需求匹配'); }
      }
    }
    
    if (matchScore >= 1) {
      results.push({
        resource_name_zh: resource.resource_name_zh || '',
        resource_name_en: resource.resource_name_en || '',
        resource_type: resource.resource_type || '',
        district: resource.district || '',
        address_zh: resource.address_zh || '',
        contact: resource.phone || '',
        website: resource.website || '',
        opening_hours: resource.opening_hours || '',
        eligibility: resource.eligibility || '',
        matched_reason: matchReasons.join('；'),
        match_score: matchScore,
        source: 'regional_resource_database'
      });
    }
  }
  
  // 按匹配分数排序，取前10条
  results.sort((a, b) => b.match_score - a.match_score);
  return results.slice(0, 10);
}

function extractDistrict(address) {
  if (!address) return '';
  
  const districts = [
    '中西區', '東區', '南區', '灣仔區',
    '九龍城區', '觀塘區', '深水埗區', '黃大仙區', '油尖旺區',
    '離島區', '葵青區', '北區', '西貢區', '沙田區', '大埔區', '荃灣區', '屯門區', '元朗區'
  ];
  
  for (const d of districts) {
    if (address.includes(d)) return d;
  }
  
  return '';
}

function parseHealthTags(healthTags) {
  if (!healthTags) return [];
  if (Array.isArray(healthTags)) return healthTags;
  try {
    return JSON.parse(healthTags);
  } catch {
    return [];
  }
}

module.exports = {
  matchResources,
  extractDistrict
};
