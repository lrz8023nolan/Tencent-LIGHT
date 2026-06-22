// 五维度风险评分引擎
// 基于 risk_scoring_rules.json
// 从 extracted_data + 慢病判断结果 计算风险等级
const { getRule } = require('./ruleLoader');

const DIMENSIONS = [
  { key: 'chronic_management', name: '慢病管理', order: 1 },
  { key: 'fall_mobility', name: '跌倒行動', order: 2 },
  { key: 'daily_function', name: '生活能力', order: 3 },
  { key: 'cognitive_communication', name: '認知溝通', order: 4 },
  { key: 'social_support', name: '社會支持', order: 5 }
];

const DIMENSION_KEY_MAP = {
  'CHRONIC_MANAGEMENT': 'chronic_management',
  'FALL_MOBILITY': 'fall_mobility', 
  'DAILY_FUNCTION': 'daily_function',
  'COGNITIVE_COMMUNICATION': 'cognitive_communication',
  'SOCIAL_ACCESS': 'social_support'
};

// 从 extracted_data 提取特征向量
function extractFeatures(extractedData, chronicDetails) {
  const features = {
    chronic_count: 0,
    chronic_diseases: [],
    chronic_uncontrolled: false,
    multiple_medications: false,
    no_regular_follow_up: false,
    no_family_doctor: false,
    
    fall_count: 0,
    recent_fall_3m: false,
    mobility_aid: false,
    mobility_limited: false,
    lives_alone: false,
    
    adl_limited: false,
    iadl_limited: false,
    meal_preparation_limited: false,
    bathing_limited: false,
    toileting_limited: false,
    
    cognitive_decline: false,
    dementia_diagnosed: false,
    communication_difficulty: false,
    forgets_medication: false,
    
    social_isolated: false,
    caregiver_burden: false,
    no_emergency_contact: false,
    financial_difficulty: false,
    housing_issue: false
  };
  
  // 从慢病结果中提取
  if (chronicDetails) {
    features.chronic_count = chronicDetails.filter(d => d.counted_as_chronic).length;
    features.chronic_diseases = chronicDetails.filter(d => d.counted_as_chronic).map(d => d.disease_name);
    
    // 多重用药判断 (≥3种慢病)
    features.multiple_medications = features.chronic_count >= 3;
  }
  
  if (!extractedData) return features;
  
  // 从基本资料提取
  const basic = extractedData.basic_info || {};
  features.lives_alone = (basic.living_arrangement || '').includes('独居') || 
                          (basic.living_arrangement || '').includes('獨居') ||
                          (basic.living_arrangement || '').includes('單獨') ||
                          (basic.living_arrangement || '').toLowerCase().includes('alone') ||
                          (basic.living_arrangement || '').toLowerCase().includes('solo');
  features.no_emergency_contact = !basic.emergency_contact || 
                                   (!basic.emergency_contact.name && !basic.emergency_contact.phone);
  
  // 从居住安排推断: 独居但没有紧急联系人
  if (features.lives_alone && features.no_emergency_contact) {
    features.social_isolated = true;
  }
  
  // 从功能事实提取
  const ff = extractedData.function_facts || {};
  
  // 跌倒 - 增强匹配
  if (Array.isArray(ff.fall_history)) {
    features.fall_count = ff.fall_history.length;
    const recent = ff.fall_history.some(f => {
      const fStr = JSON.stringify(f).toLowerCase();
      // 检查日期是否在最近
      const date = f.date || f.fall_date || '';
      if (date.includes('2025') || date.includes('2026')) return true;
      // 检查描述中是否有"近期"、"最近"等关键词
      return fStr.includes('近期') || fStr.includes('最近') || fStr.includes('上月') || fStr.includes('本月');
    });
    features.recent_fall_3m = recent;
  }
  
  // 行动 - 增强匹配
  if (Array.isArray(ff.mobility)) {
    const mobilityTexts = ff.mobility.map(m => (typeof m === 'string' ? m : (m.name || m.description || '')).toLowerCase());
    const mobilityFull = mobilityTexts.join(' ');
    features.mobility_limited = mobilityFull.includes('困難') || mobilityFull.includes('不便') || 
      mobilityFull.includes('輔助') || mobilityFull.includes('辅助') || mobilityFull.includes('受限') ||
      mobilityFull.includes('緩慢') || mobilityFull.includes('缓慢') || mobilityFull.includes('費力') ||
      mobilityFull.includes('limited') || mobilityFull.includes('difficult');
    features.mobility_aid = mobilityFull.includes('拐杖') || mobilityFull.includes('輪椅') || mobilityFull.includes('轮椅') ||
      mobilityFull.includes('助行') || mobilityFull.includes('walker') || mobilityFull.includes('cane') ||
      mobilityFull.includes('扶行') || mobilityFull.includes('輔具') || mobilityFull.includes('辅具');
  }
  
  // 生活能力
  if (Array.isArray(ff.daily_living)) {
    features.adl_limited = ff.daily_living.some(d => {
      const txt = (typeof d === 'string' ? d : (d.name || d.description || '')).toLowerCase();
      return txt.includes('困難') || txt.includes('需要協助') || txt.includes('無法');
    });
    features.meal_preparation_limited = ff.daily_living.some(d => {
      const txt = (typeof d === 'string' ? d : (d.name || '')).toLowerCase();
      return txt.includes('備餐') || txt.includes('煮食') || txt.includes('做飯') || txt.includes('meal');
    });
    features.bathing_limited = ff.daily_living.some(d => {
      const txt = (typeof d === 'string' ? d : (d.name || '')).toLowerCase();
      return txt.includes('洗澡') || txt.includes('沐浴') || txt.includes('bath');
    });
  }
  
  // 认知沟通 - 增强匹配
  if (Array.isArray(ff.cognition_communication)) {
    const cogTexts = ff.cognition_communication.map(c => (typeof c === 'string' ? c : (c.name || c.description || '')).toLowerCase());
    const cogFull = cogTexts.join(' ');
    features.cognitive_decline = cogFull.includes('記憶') || cogFull.includes('认知') || cogFull.includes('認知') || 
      cogFull.includes('忘記') || cogFull.includes('混乱') || cogFull.includes('混亂') || cogFull.includes('記憶力') ||
      cogFull.includes('memory') || cogFull.includes('cognitive') || cogFull.includes('decline') ||
      cogFull.includes('退化') || cogFull.includes('下降') || cogFull.includes('減退');
    features.communication_difficulty = cogFull.includes('溝通') || cogFull.includes('表达') || cogFull.includes('表達') ||
      cogFull.includes('聽力') || cogFull.includes('听力') || cogFull.includes('說話') || cogFull.includes('说话') ||
      cogFull.includes('hearing') || cogFull.includes('speak') || cogFull.includes('talk') ||
      cogFull.includes('聽不清') || cogFull.includes('聽不到');
    features.forgets_medication = cogFull.includes('忘記吃藥') || cogFull.includes('忘記服藥') || 
      cogFull.includes('漏服') || cogFull.includes('没吃药') || cogFull.includes('忘了吃') ||
      (cogFull.includes('forget') && (cogFull.includes('medication') || cogFull.includes('pill') || cogFull.includes('药')));
  }
  
  // 社会支持 - 增强匹配
  if (Array.isArray(ff.social_support)) {
    const socTexts = ff.social_support.map(s => (typeof s === 'string' ? s : (s.name || s.description || '')).toLowerCase());
    const socFull = socTexts.join(' ');
    features.social_isolated = socFull.includes('孤立') || socFull.includes('獨居') || socFull.includes('独居') ||
      socFull.includes('缺乏') || socFull.includes('很少') || socFull.includes('無社交') || socFull.includes('無聯絡') ||
      socFull.includes('isolated') || socFull.includes('alone') || socFull.includes('lonely') ||
      socFull.includes('少與人') || socFull.includes('不出門');
    features.caregiver_burden = socFull.includes('壓力') || socFull.includes('負擔') || socFull.includes('负担') ||
      socFull.includes('照顧者') || socFull.includes('照顾者') || socFull.includes('burden') || socFull.includes('stress') ||
      socFull.includes('吃力') || socFull.includes('疲憊') || socFull.includes('疲惫') || socFull.includes('勞累');
  }
  
  // 额外推断：如果 ADL 受限且独居，标记社交孤立
  if (features.adl_limited && features.lives_alone) {
    features.social_isolated = true;
  }
  
  // 从医学事实推断
  if (Array.isArray(extractedData.medical_facts)) {
    for (const fact of extractedData.medical_facts) {
      const name = (fact.name || '').toLowerCase();
      if (name.includes('失智') || name.includes('dementia') || name.includes('認知障礙')) {
        features.dementia_diagnosed = true;
        features.cognitive_decline = true;
      }
      // 未规律覆诊
      if ((fact.type === 'visit_record' || fact.type === 'diagnosis') && 
          (name.includes('未覆診') || name.includes('中斷') || name.includes('停藥'))) {
        features.no_regular_follow_up = true;
      }
    }
  }
  
  return features;
}

// 评分单个维度 - 返回汇总 + 逐项详情
function scoreDimension(dimensionKey, features, chronicDetails, extractedData) {
  const rules = getRule('risk_scoring_rules');
  let score = 0;
  const reasons = [];
  const missingInfo = [];
  const details = []; // 逐项评分详情
  
  // 获取来源文件信息
  const sourceFiles = (extractedData && extractedData.source_files) ? extractedData.source_files.join('、') : '上傳文件';
  const livingInfo = features.lives_alone ? '獨居' : (extractedData && extractedData.basic_info && extractedData.basic_info.living_arrangement ? extractedData.basic_info.living_arrangement : '未記錄');
  
  switch (dimensionKey) {
    case 'chronic_management': {
      const count = features.chronic_count;
      const diseaseNames = features.chronic_diseases.join('、') || '無';
      
      // 慢病记录清晰度
      if (count >= 4) {
        score += 40; details.push({ item:'慢病記錄清晰度', result:`已記錄${count}種慢病（${diseaseNames}）`, item_score:2, source:sourceFiles, status:'已識別' });
      } else if (count >= 3) {
        score += 30; details.push({ item:'慢病記錄清晰度', result:`已記錄${count}種慢病（${diseaseNames}）`, item_score:2, source:sourceFiles, status:'已識別' });
      } else if (count >= 2) {
        score += 20; details.push({ item:'慢病記錄清晰度', result:`已記錄${count}種慢病（${diseaseNames}）`, item_score:1, source:sourceFiles, status:'已識別' });
      } else if (count >= 1) {
        score += 10; details.push({ item:'慢病記錄清晰度', result:`僅記錄${count}種慢病（${diseaseNames}），可能資料不全`, item_score:1, source:sourceFiles, status:'待確認' });
        missingInfo.push('缺少完整慢病診斷記錄');
      } else {
        details.push({ item:'慢病記錄清晰度', result:'未發現慢病記錄', item_score:2, source:sourceFiles, status:'關鍵缺失' });
        missingInfo.push('缺少慢病診斷記錄');
      }
      
      // 多重用药/近期监测
      if (features.multiple_medications) {
        score += 15; reasons.push('多重用藥（≥3種慢病）');
        details.push({ item:'近期監測資料', result:`需監測${count}種慢病相關指標`, item_score:1, source:sourceFiles, status:'待確認' });
      } else if (count >= 2) {
        details.push({ item:'近期監測資料', result:`需跟進${diseaseNames}的定期監測`, item_score:1, source:'系統推斷', status:'待確認' });
      } else if (count === 0) {
        details.push({ item:'近期監測資料', result:'無慢病記錄，暫不需要', item_score:0, source:'系統推斷', status:'不需要' });
      }
      
      // 连续医疗跟进
      if (features.no_regular_follow_up) {
        score += 15; reasons.push('未定期覆診');
        details.push({ item:'連續醫療跟進', result:'未有定期覆診記錄', item_score:2, source:sourceFiles, status:'高優先級' });
      } else {
        details.push({ item:'連續醫療跟進', result:count > 0 ? '未發現不定期的覆診線索' : '暫無此項', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // 无家庭医生
      if (features.no_family_doctor) {
        score += 10; reasons.push('無固定家庭醫生');
        details.push({ item:'用藥與依從性', result:'無固定家庭醫生跟進用藥', item_score:2, source:sourceFiles, status:'高優先級' });
      } else {
        details.push({ item:'用藥與依從性', result:count > 0 ? '需確認用藥依從性' : '暫無此項', item_score:count > 0 ? 1 : 0, source:'系統推斷', status:'待確認' });
      }
      
      // 健康理解与自我管理
      details.push({ item:'健康理解與自我管理', result:count >= 3 ? '多重慢病需加強自我管理教育' : (count > 0 ? '需確認自我管理能力' : '暫無此項'), item_score:count > 0 ? 1 : 0, source:'系統推斷', status:count > 0 ? '待確認' : '不需要' });
      
      // 慢病服务连接意愿
      details.push({ item:'慢病服務連接意願', result:count > 0 ? '可推薦DHC/CDCC服務' : '暫無此項', item_score:0, source:'系統推斷', status:count > 0 ? '可推薦' : '不需要' });
      
      if (count > 0 && score >= 30) reasons.push(`已確認${count}種慢病`);
      break;
    }
    
    case 'fall_mobility': {
      const fallCount = features.fall_count;
      
      // 近期跌倒史
      if (fallCount >= 3) {
        score += 30; reasons.push(`近一年跌倒${fallCount}次`);
        details.push({ item:'近期跌倒史', result:`有${fallCount}次跌倒記錄`, item_score:2, source:sourceFiles, status:'已識別' });
      } else if (fallCount >= 2) {
        score += 25; reasons.push(`近一年跌倒${fallCount}次`);
        details.push({ item:'近期跌倒史', result:`有${fallCount}次跌倒記錄`, item_score:2, source:sourceFiles, status:'已識別' });
      } else if (fallCount >= 1) {
        score += 15; reasons.push('曾跌倒記錄');
        details.push({ item:'近期跌倒史', result:'有跌倒記錄', item_score:1, source:sourceFiles, status:'已識別' });
      } else {
        details.push({ item:'近期跌倒史', result:'未發現跌倒記錄', item_score:0, source:sourceFiles, status:'待確認' });
      }
      
      if (features.recent_fall_3m) { score += 15; reasons.push('近期有跌倒'); }
      
      // 行动能力
      if (features.mobility_aid && features.mobility_limited) {
        score += 15 + 10; details.push({ item:'行動能力', result:'需使用輔助工具，行動受限', item_score:2, source:sourceFiles, status:'已識別' });
      } else if (features.mobility_aid) {
        score += 15; reasons.push('使用助行工具');
        details.push({ item:'行動能力', result:'需使用輔助工具', item_score:1, source:sourceFiles, status:'已識別' });
      } else if (features.mobility_limited) {
        score += 10; reasons.push('行動能力受限');
        details.push({ item:'行動能力', result:'行動能力受限', item_score:1, source:sourceFiles, status:'已識別' });
      } else {
        details.push({ item:'行動能力', result:'未發現行動能力受限線索', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // 家居环境风险
      const homeRisk = features.lives_alone && fallCount > 0;
      if (homeRisk) {
        score += 20; reasons.push('獨居且有跌倒史');
        details.push({ item:'家居環境風險', result:'獨居且有跌倒史，家居安全風險高', item_score:2, source:'系統推斷', status:'高優先級' });
      } else {
        details.push({ item:'家居環境風險', result:features.lives_alone ? '獨居，需評估家居安全' : '需確認家居環境', item_score:1, source:'系統推斷', status:'待確認' });
      }
      
      // 跌倒后支持
      if (features.lives_alone && fallCount > 0) {
        details.push({ item:'跌倒後支持', result:'獨居且有跌倒史，需緊急支持安排', item_score:2, source:'系統推斷', status:'高優先級' });
      } else if (features.no_emergency_contact) {
        details.push({ item:'跌倒後支持', result:'缺少緊急聯絡人', item_score:2, source:sourceFiles, status:'高優先級' });
      } else {
        details.push({ item:'跌倒後支持', result:'緊急聯絡人已記錄', item_score:0, source:sourceFiles, status:'已記錄' });
      }
      
      if (fallCount === 0 && !features.mobility_limited) {
        missingInfo.push('缺少跌倒史及行動能力評估記錄');
      }
      break;
    }
    
    case 'daily_function': {
      // ADL
      if (features.adl_limited) {
        score += 25; reasons.push('日常活動能力受限');
        details.push({ item:'基本生活能力 (ADL)', result:'日常活動需協助', item_score:1, source:sourceFiles, status:'已識別' });
        if (features.bathing_limited) { score += 20; reasons.push('洗澡需協助'); }
        if (features.toileting_limited) { score += 20; reasons.push('如廁需協助'); }
      } else {
        details.push({ item:'基本生活能力 (ADL)', result:'未發現ADL受限線索', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // IADL
      if (features.meal_preparation_limited) {
        score += 15; details.push({ item:'工具性日常生活能力 (IADL)', result:'備餐、購物等有困難', item_score:2, source:sourceFiles, status:'高優先級' });
      } else if (features.adl_limited) {
        details.push({ item:'工具性日常生活能力 (IADL)', result:'ADL受限可能影響IADL', item_score:1, source:'系統推斷', status:'待確認' });
      } else {
        details.push({ item:'工具性日常生活能力 (IADL)', result:'未發現IADL受限線索', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // 服药管理
      if (features.forgets_medication) {
        score += 0; details.push({ item:'服藥管理能力', result:'有忘記服藥記錄，需協助', item_score:1, source:sourceFiles, status:'待確認' });
      } else if (features.chronic_count > 0) {
        details.push({ item:'服藥管理能力', result:`需管理${features.chronic_count}種慢病用藥，需確認`, item_score:1, source:'系統推斷', status:'待確認' });
      } else {
        details.push({ item:'服藥管理能力', result:'暫無此項', item_score:0, source:'系統推斷', status:'不需要' });
      }
      
      // 外出能力
      if (features.mobility_limited || features.mobility_aid) {
        details.push({ item:'外出能力', result:'行動受限，外出可能有困難', item_score:2, source:sourceFiles, status:'已識別' });
      } else if (features.lives_alone && features.chronic_count >= 2) {
        details.push({ item:'外出能力', result:'獨居且有多重慢病，需確認外出能力', item_score:1, source:'系統推斷', status:'待確認' });
      } else {
        details.push({ item:'外出能力', result:'未發現外出受限線索', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      if (features.lives_alone && features.adl_limited) { score += 15; reasons.push('獨居且生活能力受限'); }
      if (!features.adl_limited) missingInfo.push('缺少日常生活能力評估記錄');
      break;
    }
    
    case 'cognitive_communication': {
      // 认知状况
      if (features.dementia_diagnosed) {
        score += 40; reasons.push('已確診認知障礙/失智症');
        details.push({ item:'理解醫生解釋', result:'認知障礙可能影響理解能力', item_score:2, source:sourceFiles, status:'高優先級' });
      } else if (features.cognitive_decline) {
        score += 25; reasons.push('有認知功能下降跡象');
        details.push({ item:'理解醫生解釋', result:'有認知功能下降，需評估理解能力', item_score:1, source:sourceFiles, status:'待確認' });
      } else {
        details.push({ item:'理解醫生解釋', result:'未發現認知問題線索', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // 听力/沟通
      if (features.communication_difficulty) {
        score += 15; reasons.push('溝通表達困難');
        details.push({ item:'聽力 / 溝通', result:'存在溝通困難', item_score:1, source:sourceFiles, status:'已識別' });
      } else {
        details.push({ item:'聽力 / 溝通', result:'未發現溝通障礙線索', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // 记忆与执行
      if (features.forgets_medication) {
        score += 20; reasons.push('有忘記服藥記錄');
        details.push({ item:'記憶與執行', result:'有忘記服藥記錄', item_score:1, source:sourceFiles, status:'待確認' });
      } else if (features.cognitive_decline) {
        details.push({ item:'記憶與執行', result:'認知功能下降需評估記憶力', item_score:1, source:'系統推斷', status:'待確認' });
      } else {
        details.push({ item:'記憶與執行', result:'未發現記憶力問題線索', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // 数字工具使用
      details.push({ item:'數字工具使用', result:features.dementia_diagnosed ? '認知障礙影響數字工具使用' : '未評估', item_score:features.dementia_diagnosed ? 2 : 0, source:'系統推斷', status:features.dementia_diagnosed ? '已識別' : '待確認' });
      
      if (!features.cognitive_decline && !features.dementia_diagnosed) missingInfo.push('缺少認知功能評估記錄');
      break;
    }
    
    case 'social_support': {
      // 居住情况
      if (features.lives_alone) {
        score += 25; reasons.push('獨居');
        details.push({ item:'居住情況', result:'獨居', item_score:2, source:sourceFiles, status:'已識別' });
      } else {
        details.push({ item:'居住情況', result:livingInfo, item_score:0, source:sourceFiles, status:'已記錄' });
      }
      
      // 照顾者支持
      if (features.caregiver_burden) {
        score += 15; reasons.push('照顧者壓力');
        details.push({ item:'照顧者支持', result:'照顧者有壓力，支持可能不穩定', item_score:1, source:sourceFiles, status:'待確認' });
      } else if (features.lives_alone) {
        details.push({ item:'照顧者支持', result:'獨居，需確認是否有照顧者', item_score:1, source:'系統推斷', status:'待確認' });
      } else {
        details.push({ item:'照顧者支持', result:'未發現照顧者壓力線索', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // 社交孤立
      if (features.social_isolated) {
        score += 20; reasons.push('社交孤立');
        details.push({ item:'服務認知', result:'社交孤立，可能不清楚社區資源', item_score:1, source:'系統推斷', status:'待確認' });
      } else {
        details.push({ item:'服務認知', result:'未評估對社區資源的了解', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      // 紧急联系人
      if (features.no_emergency_contact) {
        score += 20; reasons.push('缺少緊急聯絡人');
        details.push({ item:'服務參與意願', result:'缺少緊急聯絡人，服務參與意願待了解', item_score:1, source:sourceFiles, status:'待確認' });
      } else {
        details.push({ item:'服務參與意願', result:'有緊急聯絡人，需確認服務參與意願', item_score:0, source:sourceFiles, status:'待確認' });
      }
      
      // 资源可及性
      if (features.housing_issue) {
        score += 10; reasons.push('居住環境問題');
        details.push({ item:'資源可及性', result:'居住環境存在問題，影響服務可及性', item_score:1, source:sourceFiles, status:'待確認' });
      } else if (features.financial_difficulty) {
        score += 15; reasons.push('經濟困難');
        details.push({ item:'資源可及性', result:'經濟困難可能影響服務獲取', item_score:1, source:'系統推斷', status:'待確認' });
      } else if (features.mobility_limited) {
        details.push({ item:'資源可及性', result:'行動受限可能影響前往服務點', item_score:1, source:'系統推斷', status:'待確認' });
      } else {
        details.push({ item:'資源可及性', result:'未評估資源可及性', item_score:0, source:'系統推斷', status:'待確認' });
      }
      
      if (!features.lives_alone && !features.social_isolated) missingInfo.push('缺少社會支持評估記錄');
      break;
    }
  }
  
  // 确定风险等级
  let riskLevel = 'low';
  if (score >= 67) riskLevel = 'high';
  else if (score >= 34) riskLevel = 'medium';
  
  return { score, riskLevel, reasons, missingInfo, details };
}

// 检查红旗规则
function checkRedFlags(features, dimensions) {
  const redFlags = [];
  
  // 多次跌倒 + 独居
  if (features.fall_count >= 2 && features.lives_alone) {
    redFlags.push({ rule: '多次跌倒且獨居', priority: 'high', description: '長者有多次跌倒記錄且獨居，存在嚴重安全風險' });
  }
  
  // 认知障碍 + 独居
  if (features.dementia_diagnosed && features.lives_alone) {
    redFlags.push({ rule: '認知障礙且獨居', priority: 'high', description: '長者確診認知障礙且獨居，需要緊急介入' });
  }
  
  // 忘记服药 + 多重慢病
  if (features.forgets_medication && features.chronic_count >= 3) {
    redFlags.push({ rule: '忘記服藥且多重慢病', priority: 'high', description: '長者有多重慢病且有忘記服藥記錄，藥物管理風險高' });
  }
  
  // 高维度风险数
  const highDims = dimensions.filter(d => d.riskLevel === 'high');
  if (highDims.length >= 3) {
    redFlags.push({ rule: '≥3個維度高風險', priority: 'high', description: `長者有${highDims.length}個維度評為高風險` });
  }
  
  // 无紧急联系人
  if (features.no_emergency_contact && (features.lives_alone || features.adl_limited)) {
    redFlags.push({ rule: '無緊急聯絡人且存在風險', priority: 'medium', description: '長者缺少緊急聯絡人，在緊急情況下可能無法及時獲得幫助' });
  }
  
  return redFlags;
}

// 综合风险评估
function determineOverallRisk(dimensions, redFlags) {
  const highDims = dimensions.filter(d => d.riskLevel === 'high').length;
  const mediumDims = dimensions.filter(d => d.riskLevel === 'medium').length;
  const hasRedFlag = redFlags.some(r => r.priority === 'high');
  
  if (hasRedFlag) return 'high';
  if (highDims >= 2) return 'high';
  if (highDims >= 1 || mediumDims >= 2) return 'medium';
  return 'low';
}

// 生成系统行动建议
function generateSystemActions(dimensions, redFlags) {
  const actions = [];
  
  for (const dim of dimensions) {
    if (dim.riskLevel === 'high') {
      switch (dim.dimension_name) {
        case '慢病管理': actions.push('建議社工安排個案經理跟進慢病管理，協助預約覆診'); break;
        case '跌倒行動': actions.push('建議安排家居安全評估，考慮安裝扶手及防滑設施'); break;
        case '生活能力': actions.push('建議轉介家居照顧服務，評估是否需要送餐或陪診服務'); break;
        case '認知溝通': actions.push('建議安排認知功能評估，考慮轉介至記憶診所'); break;
        case '社會支持': actions.push('建議連結社區資源，安排義工探訪或長者中心活動'); break;
      }
    }
  }
  
  for (const flag of redFlags) {
    if (flag.priority === 'high') {
      actions.push(`緊急：${flag.description}`);
    }
  }
  
  return actions;
}

// 主评估函数
function evaluateRisk(extractedData, chronicDetails) {
  const features = extractFeatures(extractedData, chronicDetails);
  
  // 评分五个维度
  const dimensions = DIMENSIONS.map(dim => {
    const { score, riskLevel, reasons, missingInfo, details } = scoreDimension(dim.key, features, chronicDetails, extractedData);
    return {
      dimension_key: dim.key,
      dimension_name: dim.name,
      score,
      riskLevel,
      reasons,
      missingInfo,
      scoring_details: details,
      system_action: []
    };
  });
  
  // 检查红旗
  const redFlags = checkRedFlags(features, dimensions);
  
  // 综合风险
  const overallRisk = determineOverallRisk(dimensions, redFlags);
  
  // 系统行动
  const systemActions = generateSystemActions(dimensions, redFlags);
  
  // 分配行动到各维度
  for (const dim of dimensions) {
    dim.system_action = systemActions.filter(a => 
      a.includes(dim.dimension_name) || 
      (dim.riskLevel === 'high' && !a.startsWith('建議社工'))
    );
    if (dim.system_action.length === 0 && dim.riskLevel === 'high') {
      dim.system_action = [`建議社工重點跟進${dim.dimension_name}相關風險`];
    }
  }
  
  return {
    dimensions,
    red_flags: redFlags,
    overall_risk: overallRisk,
    system_actions: systemActions,
    features_summary: {
      chronic_count: features.chronic_count,
      fall_count: features.fall_count,
      lives_alone: features.lives_alone,
      cognitive_decline: features.cognitive_decline,
      adl_limited: features.adl_limited
    }
  };
}

// 计算雷达图分数（转换为 1-3 的分数，1=高风险=靠近中心）
function getRadarScores(dimensions) {
  const scoreMap = { high: 1, medium: 2, low: 3 };
  const labels = dimensions.map(d => d.dimension_name);
  const scores = dimensions.map(d => scoreMap[d.riskLevel] || 2);
  
  return { labels, scores };
}

module.exports = {
  evaluateRisk,
  getRadarScores,
  DIMENSIONS
};
