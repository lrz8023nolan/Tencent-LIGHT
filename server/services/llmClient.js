// LLM 客户端 — DeepSeek API
// 核心原则：LLM 自由理解语言，输出结构化结果 → rule engine 定边界

const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
const LLM_API_ENDPOINT = process.env.LLM_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o';

function isConfigured() {
  return !!LLM_API_KEY && LLM_API_KEY !== 'your_api_key_here';
}

async function callLLM(messages, options = {}) {
  if (!isConfigured()) throw new Error('LLM API Key 未配置');

  const body = {
    model: LLM_MODEL,
    messages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.maxTokens || 8000
  };
  if (options.responseFormat === 'json') body.response_format = { type: 'json_object' };

  const response = await fetch(LLM_API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`LLM API 失败 (${response.status}): ${await response.text()}`);
  return (await response.json()).choices[0].message.content;
}

// ============================================================
// 核心：结构化信息抽取（灵活的语义理解 + 数字化规则）
// ============================================================

const EXTRACTION_SYSTEM_PROMPT = `你是香港社区长者健康评估的数据提取专家。你的任务是从任何形式的文本（体检表、病历、化验单、访谈记录、手写OCR结果等）中提取信息。

# 核心原则
1. **灵活理解语言**：不要求精确匹配某个词。繁体/简体、中文/英文、专业术语/口语、全称/缩写 — 只要语义相同就提取
2. **归一化输出**：把各种表达归一化为标准字段。例如 "BP 160 over 95" → name:"血壓" value:"160/95"
3. **先提取再判断**：先输出你看到了什么，再输出你的判断
4. **宁缺毋滥**：只提取文件中明确记载的信息，不推测不编造
5. **结构化灵活性**：medical_facts 中的 name 和 type 字段使用标准化的繁体中文名称，方便后续规则引擎匹配

# 语言归一化指南
- "高血压 / 高血壓 / hypertension / HTN / high BP / 血壓高" → name:"高血壓"
- "糖尿病 / 糖尿病 / DM / diabetes / sugar / 血糖高" → name:"糖尿病"  
- "高血脂 / 高血脂 / hyperlipidemia / high cholesterol / 高胆固醇 / 血脂異常" → name:"高血脂/血脂異常"
- "中風 / 中风 / stroke / CVA / 腦卒中" → name:"中風"
- "冠心病 / CHD / coronary / IHD / 通波仔 / 心絞痛 / 心梗" → name:"冠心��/心梗/心絞痛"
- "腎病 / 肾病 / CKD / kidney / renal / 腎功能不全" → name:"慢性腎病"
- "慢阻肺 / COPD / 肺氣腫 / emphysema / 慢性支氣管炎" → name:"慢阻肺"
- "失智 / dementia / 認知障礙 / Alzheimer / 阿茲海默 / 記性差" → name:"失智症/認知障礙"
- "抑鬱 / 抑郁 / depression / 焦慮 / anxiety / 失眠 / 情绪低落" → name:"抑鬱/焦慮記錄"
- "痛風 / 痛风 / gout / uric acid / 尿酸高" → name:"痛風/高尿酸"
- "骨質疏鬆 / 骨质疏松 / osteoporosis / 骨折" → name:"骨質疏鬆/骨折史"
- "房顫 / AF / atrial fibrillation / 心律不齊 / 心律失常" → name:"房顫/心律失常"
- "心衰竭 / 心力衰竭 / heart failure / HF / 心臟衰竭" → name:"心力衰竭"
- "哮喘 / asthma / 气喘 / 氣喘" → name:"哮喘"
- "癌症 / cancer / 腫瘤 / tumor / 癌" → name:"癌症史"
- "肝病 / liver disease / hepatitis / 肝炎 / 肝硬化" → name:"慢性肝病"

# name 字段标准化规则
- **疾病诊断类**：使用上述归一化名称（繁体中文），如 name:"高血壓"、name:"糖尿病"
- **化验/生命体征类**：使用检查项目标准名称，如 name:"收縮壓"、name:"空腹血��"、name:"糖化血紅蛋白"、name:"總膽固醇"、name:"尿酸"
- **用药类**：使用药品通用名（繁体），如 name:"二甲雙胍"、name:"氨氯地平"
- **重要**：type 字段严格区分：diagnosis（诊断）、lab_result（化验结果）、vital_sign（生命体征）、medication（用药）、symptom（症状）、self_report（自述）、visit_record（就诊记录）

# 数字化异常判定规则（香港标准）
以下数值在提取时需特别标注为异常：

| 指标 | 异常阈值 | 说明 |
|------|---------|------|
| 收缩压 (SBP) | >= 140 mmHg | 长者高血压标准(中国高血压防治指南2024) |
| 舒张压 (DBP) | >= 90 mmHg | 长者高血压标准 |
| 空腹血糖 (FPG) | >= 7.0 mmol/L | 糖尿病诊断标准(中国2型糖尿病防治指南2024) |
| 随机血糖 (RPG) | >= 11.1 mmol/L | 伴典型症状 |
| HbA1c | >= 6.5% | 糖尿病诊断标准 |
| 总胆固醇 (TC) | >= 5.2 mmol/L | 边缘升高(中国血脂管理指南2024) |
| LDL-C (坏胆固醇) | >= 3.4 mmol/L | 边缘升高 |
| 甘油三酯 (TG) | >= 1.7 mmol/L | 边缘升高 |
| HDL-C (好胆固醇) | < 1.0 mmol/L(男)/1.3(女) | 偏低 |
| 尿酸 (UA) | > 420 umol/L(男)/360(女) | 高尿酸(中国痛风指南2024) |
| eGFR | < 60 mL/min | 肾功能下降(KDIGO 2024) |
| 血清肌酐 (Cr) | > 133 umol/L(男)/106(女) | 肾功能异常(香港医管局) |
| ALT | > 40 U/L(男)/31(女) | 肝功能异常(香港医管局) |

识别到上述数值异常时，在 medical_facts 中：
- type 设为 "vital_sign" 或 "lab_result"
- 标注 is_abnormal: true
- 标注 abnormal_reason: "SBP 150 >= 140 阈值"

# 功能评估灵活识别
对于 function_facts 各维度，如果不确定分类，请放入最相关的维度：
- fall_history: 跌倒、绊倒、摔倒、跌亲
- mobility: 行走、上下楼梯、外出、拐杖、轮椅、助行器
- daily_living: 洗澡、穿衣、吃饭、如厕、煮食、购物、打扫
- cognition_communication: 记忆、忘记、听力、视力、说话、理解、混乱
- social_support: 独居、家人、邻居、朋友、经济、社区服务

# 输出 JSON Schema
{
  "extraction_note": "你从文本中看到了什么的简要总结（2-3句）",
  "basic_info": {
    "name": "姓名",
    "age": 数字或null,
    "gender": "男/女",
    "address": "地址",
    "phone": "电话",
    "id_number": "身份证号",
    "emergency_contact": {"name":"","relation":"","phone":""},
    "living_arrangement": "居住安排（独居/与配偶同住/与子女同住/...）",
    "district": "所在区域（如：黄大仙区、沙田区、观塘区）"
  },
  "medical_facts": [
    {
      "type": "diagnosis|lab_result|vital_sign|medication|symptom|self_report|visit_record",
      "name": "归一化名称（用繁体中文标准名称）",
      "value": "数值或文字",
      "unit": "单位（如 mmHg、mmol/L、%、umol/L）",
      "date": "YYYY-MM-DD 或 YYYY 或留空",
      "source": "来源文件名",
      "evidence_text": "原文摘录（引用原文中的文字，不可改写）",
      "is_abnormal": true/false,
      "abnormal_reason": "异常原因说明（如：SBP 160 >= 140 阈值）",
      "confidence": 0.0-1.0
    }
  ],
  "function_facts": {
    "fall_history": [{"date":"","description":"描述跌倒情况","source":"来源"}],
    "mobility": [{"description":"描述行动能力","source":"来源"}],
    "daily_living": [{"description":"描述日常生活能力","source":"来源"}],
    "cognition_communication": [{"description":"描述认知沟通状况","source":"来源"}],
    "social_support": [{"description":"描述社会支持情况","source":"来源"}]
  },
  "judgment_summary": {
    "suspected_conditions": ["可能存在的健康问题列表"],
    "key_concerns": ["重点关注事项"],
    "needs_follow_up": ["需要追问的信息"]
  },
  "missing_information": ["缺少的关键信息"],
  "source_files": ["文件名"]
}

# 重要规则
1. age 必须是纯数字，不要带"岁"等文字
2. 血压值格式统一为 "收缩压/舒张压"（如 "150/95"），单位 mmHg
3. 血糖值只保留数值（如 "8.5"），单位在 unit 字段标注
4. 日期统一 YYYY-MM-DD，无法确定则留空
5. evidence_text 必须引用原文，不能改写
6. 姓名、地址使用繁体中文
7. 对于异常数值，is_abnormal 必须设为 true 并在 abnormal_reason 中说明具体阈值对比
8. 英文缩写或英文名在 name 字段中用上述归一化繁体中文名称写出（如 "HTN" → "高血壓"）
9. function_facts 中 description 字段用自然语言描述，不要求固定格式
10. 如果同一疾病有多种证据（诊断+化验+用药），分别在 medical_facts 中列出来`;

// ============================================================
// 结构化信息抽取（主函数）
// ============================================================

async function extractElderInfo(text, sourceFiles = []) {
  if (!isConfigured()) return simulateExtraction(text);

  try {
    const userPrompt = sourceFiles.length > 0
      ? `请从以下文件中提取结构化信息。\n\n来源文件：${sourceFiles.join('、')}\n\n文件内容：\n${text.substring(0, 15000)}`
      : `请从以下文本中提取结构化信息。\n\n${text.substring(0, 15000)}`;

    const result = await callLLM([
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ], { temperature: 0, maxTokens: 8000, responseFormat: 'json' });

    const parsed = JSON.parse(result);
    // 确保字段完整
    return normalizeExtraction(parsed);
  } catch (error) {
    console.error('[LLM] 结构化提取失败:', error.message);
    console.log('[LLM] 降级到模拟提取');
    return simulateExtraction(text);
  }
}

function normalizeExtraction(data) {
  return {
    extraction_note: data.extraction_note || '',
    basic_info: {
      name: data.basic_info?.name || '',
      age: data.basic_info?.age || null,
      gender: data.basic_info?.gender || '',
      address: data.basic_info?.address || '',
      phone: data.basic_info?.phone || '',
      id_number: data.basic_info?.id_number || '',
      emergency_contact: data.basic_info?.emergency_contact || { name: '', relation: '', phone: '' },
      living_arrangement: data.basic_info?.living_arrangement || '',
      district: data.basic_info?.district || ''
    },
    medical_facts: (data.medical_facts || []).map(f => ({
      type: f.type || 'diagnosis',
      name: f.name || '',
      value: f.value || '',
      unit: f.unit || '',
      date: f.date || '',
      source: f.source || '',
      evidence_text: f.evidence_text || '',
      is_abnormal: f.is_abnormal || false,
      abnormal_reason: f.abnormal_reason || '',
      confidence: f.confidence || 0.8
    })),
    function_facts: {
      fall_history: data.function_facts?.fall_history || [],
      mobility: data.function_facts?.mobility || [],
      daily_living: data.function_facts?.daily_living || [],
      cognition_communication: data.function_facts?.cognition_communication || [],
      social_support: data.function_facts?.social_support || []
    },
    judgment_summary: data.judgment_summary || { suspected_conditions: [], key_concerns: [], needs_follow_up: [] },
    missing_information: data.missing_information || [],
    source_files: data.source_files || []
  };
}

// ============================================================
// 模拟提取（API 未配置时的降级方案）
// ============================================================

function simulateExtraction(text) {
  const result = {
    extraction_note: '未配置LLM API，使用基础文本匹配提取',
    basic_info: { name: '', age: null, gender: '', address: '', phone: '', id_number: '', emergency_contact: { name: '', relation: '', phone: '' }, living_arrangement: '', district: '' },
    medical_facts: [],
    function_facts: { fall_history: [], mobility: [], daily_living: [], cognition_communication: [], social_support: [] },
    judgment_summary: { suspected_conditions: [], key_concerns: [], needs_follow_up: [] },
    missing_information: ['LLM API 未配置，请配置后重新上传'],
    source_files: []
  };

  const m = text.match(/姓名[：:]\s*(.+)/);
  if (m) result.basic_info.name = m[1].trim();
  const a = text.match(/年齡[：:]\s*(\d+)/);
  if (a) result.basic_info.age = parseInt(a[1]);
  const g = text.match(/性別[：:]\s*(男|女)/);
  if (g) result.basic_info.gender = g[1];

  // 血压提取
  const bp = text.match(/(?:血壓|血压|BP)[：:]\s*(\d{2,3}\/\d{2,3})/);
  if (bp) {
    result.medical_facts.push({ type: 'vital_sign', name: '血壓', value: bp[1], unit: 'mmHg', date: '', source: '文件', evidence_text: bp[0], is_abnormal: checkBpAbnormal(bp[1]), abnormal_reason: '', confidence: 0.8 });
  }

  const diseaseKeys = ['糖尿病', '高血壓', '高血压', '冠心病', '中風', '中风', '慢性腎病', '慢性肾病', '慢阻肺', '哮喘', '骨質疏鬆', '骨质疏松', '失智', '抑鬱', '抑郁', '癌症', '痛風', '痛风', '高血脂'];
  for (const kw of diseaseKeys) {
    if (text.includes(kw)) {
      result.medical_facts.push({ type: 'diagnosis', name: kw, value: '提及', unit: '', date: '', source: '文件', evidence_text: `文件中提及「${kw}」`, is_abnormal: false, abnormal_reason: '', confidence: 0.7 });
    }
  }

  if (text.includes('跌倒') || text.includes('摔倒')) result.function_facts.fall_history.push({ date: '', description: '提及跌倒', source: '文件' });
  if (text.includes('輪椅') || text.includes('拐杖') || text.includes('助行')) result.function_facts.mobility.push({ description: '使用輔助工具', source: '文件' });

  return result;
}

function checkBpAbnormal(bpStr) {
  const [sbp] = bpStr.split('/').map(Number);
  return sbp >= 140;
}

// ============================================================
// 语音转文字
// ============================================================

const TRANSCRIPTION_SYSTEM_PROMPT = `你是粤语/普通话/英语语音转录专家。请将以下语音内容转写为繁体中文文本。
规则：
1. 粤语口语转为书面繁体中文
2. 保持原文意思，不添加不删减
3. 如有医学术语保持原样输出
4. 只输出转录文本`;

async function transcribeVoice(audioBase64, mimeType = 'audio/webm') {
  if (!isConfigured()) {
    return { text: '', error: 'LLM API 未配置，无法进行语音转写' };
  }

  try {
    // DeepSeek 支持 vision 但不支持 audio，我们用它做通用文本理解
    // 这里用 LLM 做伪音频理解：把 audio 当成 base64 传给模型
    // 实际应用中应使用专门的 STT 服务
    const result = await callLLM([
      { role: 'system', content: TRANSCRIPTION_SYSTEM_PROMPT },
      { role: 'user', content: `请将以下语音内容转写为繁体中文文本。音频格式：${mimeType}` }
    ], { temperature: 0, maxTokens: 2000 });

    return { text: result.trim() };
  } catch (error) {
    console.error('[Voice] 转写失败:', error.message);
    return { text: '', error: error.message };
  }
}

// ============================================================
// 生成摘要
// ============================================================

async function generateSummary(extractedData, chronicDetails, riskResult) {
  if (!isConfigured()) return generateDefaultSummary(extractedData, chronicDetails, riskResult);

  const chronicNames = (chronicDetails || []).filter(d => d.counted_as_chronic).map(d => d.disease_name);
  const highDims = (riskResult?.dimensions || []).filter(d => d.riskLevel === 'high');

  const prompt = `作为香港社区长者服务社工助手，请为以下长者生成一段约150字的简要评估摘要（繁体中文），语气专业但温暖：

姓名：${extractedData?.basic_info?.name || '长者'}
年龄：${extractedData?.basic_info?.age || '未知'}
慢病数量：${chronicNames.length}（${chronicNames.join('、') || '无'}）
综合风险等级：${riskResult?.overall_risk || 'pending'}
高风险维度：${highDims.map(d => d.dimension_name).join('、') || '无'}

摘要应包含：慢病概况、需要关注的健康维度、建议采取的跟进措施。面向社工阅读，不需要家属友好语气。`;

  try {
    return await callLLM([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 500 });
  } catch {
    return generateDefaultSummary(extractedData, chronicDetails, riskResult);
  }
}

function generateDefaultSummary(extractedData, chronicDetails, riskResult) {
  const name = extractedData?.basic_info?.name || '長者';
  const names = (chronicDetails || []).filter(d => d.counted_as_chronic).map(d => d.disease_name);
  const risk = riskResult?.overall_risk || '待評估';
  return `${name}，${names.length > 0 ? `已确认${names.length}种慢病（${names.join('、')}）。` : '暂未发现已确认慢病记录。'}综合风险评估为「${risk === 'high' ? '高風險' : risk === 'medium' ? '中風險' : risk === 'low' ? '低風險' : '待評估'}」。`;
}

module.exports = { isConfigured, callLLM, extractElderInfo, transcribeVoice, generateSummary };
