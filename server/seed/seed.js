// 种子数据脚本 - 为开发测试生成初始数据
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { loadAllRules } = require('../services/ruleLoader');
const db = require('../db/database');
const { evaluateChronicDiseases } = require('../services/chronicDiseaseEvaluator');
const { evaluateRisk } = require('../services/riskEvaluator');
const { matchRecommendations } = require('../services/recommendationService');
const { matchResources } = require('../services/resourceMatchingService');
const { generateSummary } = require('../services/llmClient');

console.log('[Seed] 开始生成种子数据...');

// 6条测试长者数据
const seedElders = [
  {
    archive_no: 'ARC0001',
    name: '王阿婆',
    age: 78,
    gender: '女',
    address: '香港九龍觀塘區順利邨利明樓508室',
    phone: '2345-6789',
    id_number: 'A123456(7)',
    emergency_contact_name: '王志強',
    emergency_contact_relation: '兒子',
    emergency_contact_phone: '9876-5432',
    district: '觀塘區',
    responsible_worker: '陳社工',
    status: 'pending',
    is_pending_ai_review: 1,
    extracted_data: {
      basic_info: {
        name: '王阿婆',
        age: 78,
        gender: '女',
        address: '觀塘區順利邨利明樓508室',
        phone: '2345-6789',
        living_arrangement: '獨居',
        emergency_contact: { name: '王志強', relation: '兒子', phone: '9876-5432' }
      },
      medical_facts: [
        { type: 'diagnosis', name: '高血壓', value: '確診', date: '2023-01-15', source: '聯合醫院門診記錄', evidence_text: '高血壓病史5年，目前服藥控制', confidence: 0.95 },
        { type: 'diagnosis', name: '糖尿病', value: '確診', date: '2022-06-10', source: '聯合醫院門診記錄', evidence_text: '二型糖尿病，口服降糖藥', confidence: 0.95 },
        { type: 'lab_result', name: 'HbA1c', value: '8.2', unit: '%', date: '2026-01-20', source: '聯合醫院化驗報告', evidence_text: '糖化血紅素偏高', confidence: 0.9 },
        { type: 'medication', name: 'Amlodipine 5mg', value: '每日一次', source: '藥物紀錄', evidence_text: '降血壓藥', confidence: 0.9 },
        { type: 'medication', name: 'Metformin 500mg', value: '每日兩次', source: '藥物紀錄', evidence_text: '降血糖藥', confidence: 0.9 }
      ],
      function_facts: {
        fall_history: [
          { date: '2025-11-10', description: '在家中浴室滑倒，右髖部瘀傷', source: '聯合醫院急診記錄' },
          { date: '2025-08-03', description: '在街市購物時跌倒，無明顯受傷', source: '長者自述' }
        ],
        mobility: [
          { description: '需要使用拐杖輔助行走', source: '社工家訪記錄' },
          { description: '上下樓梯有困難，需扶扶手', source: '社工家訪記錄' }
        ],
        daily_living: [
          { description: '備餐困難，經常食用即食麵或罐頭', source: '社工家訪記錄' },
          { description: '洗澡需要輔助，曾因地面濕滑在浴室跌倒', source: '社工家訪記錄' }
        ],
        cognition_communication: [
          { description: '有時忘記是否已服藥', source: '長者自述' }
        ],
        social_support: [
          { description: '獨居，兒子每週探望一次', source: '社工家訪記錄' },
          { description: '很少參加社區活動', source: '長者自述' }
        ]
      },
      missing_information: ['缺少近期血脂檢查結果', '缺少認知功能評估'],
      source_files: ['2025_聯合醫院_門診記錄_王阿婆.pdf']
    }
  },
  {
    archive_no: 'ARC0002',
    name: '陳伯',
    age: 82,
    gender: '男',
    address: '香港新界沙田區博康邨博華樓312室',
    phone: '3456-7890',
    id_number: 'B234567(8)',
    emergency_contact_name: '陳美玲',
    emergency_contact_relation: '女兒',
    emergency_contact_phone: '6543-2198',
    district: '沙田區',
    responsible_worker: '陳社工',
    status: 'pending',
    is_pending_ai_review: 1,
    extracted_data: {
      basic_info: {
        name: '陳伯', age: 82, gender: '男',
        address: '沙田區博康邨博華樓312室', phone: '3456-7890',
        living_arrangement: '與配偶同住',
        emergency_contact: { name: '陳美玲', relation: '女兒', phone: '6543-2198' }
      },
      medical_facts: [
        { type: 'diagnosis', name: '冠心病', value: '確診', date: '2020-03-20', source: '威爾斯親王醫院出院摘要', evidence_text: '冠狀動脈支架術後', confidence: 0.95 },
        { type: 'diagnosis', name: '高血壓', value: '確診', date: '2020-03-20', source: '威爾斯親王醫院出院摘要', evidence_text: '高血壓病史', confidence: 0.95 },
        { type: 'diagnosis', name: '慢性腎病', value: '確診', date: '2023-09-12', source: '腎科專科門診記錄', evidence_text: 'CKD Stage 3，定期覆診', confidence: 0.95 },
        { type: 'diagnosis', name: '中風', value: '確診', date: '2025-06-15', source: '威爾斯親王醫院入院記錄', evidence_text: '輕度缺血性中風，左側肢體乏力', confidence: 0.95 },
        { type: 'lab_result', name: 'eGFR', value: '45', unit: 'mL/min', date: '2026-02-15', source: '腎科化驗報告', evidence_text: '腎功能中度下降', confidence: 0.9 }
      ],
      function_facts: {
        fall_history: [
          { date: '2025-12-01', description: '在家中跌倒，左腕骨折', source: '急診記錄' },
          { date: '2025-03-20', description: '在公園散步時跌倒', source: '長者自述' },
          { date: '2024-08-15', description: '廁所起身時暈眩跌倒', source: '長者自述' }
        ],
        mobility: [
          { description: '中風後左側肢體乏力，行動不便', source: '物理治療評估' },
          { description: '需使用四腳拐杖輔助行走', source: '物理治療評估' }
        ],
        daily_living: [
          { description: '洗澡及穿衣需要太太協助', source: '社工家訪記錄' }
        ],
        cognition_communication: [
          { description: '中風後偶有語言表達困難', source: '言語治療評估' }
        ],
        social_support: [
          { description: '與配偶同住，配偶年事已高照顧能力有限', source: '社工家訪記錄' }
        ]
      },
      missing_information: ['缺少認知功能評估', '缺少照顧者支援需求評估'],
      source_files: ['2025_威爾斯_中風入院記錄_陳伯.pdf']
    }
  },
  {
    archive_no: 'ARC0003',
    name: '李婆婆',
    age: 72,
    gender: '女',
    address: '香港九龍黃大仙區竹園南邨華園樓215室',
    phone: '4567-8901',
    id_number: 'C345678(9)',
    emergency_contact_name: '李小明',
    emergency_contact_relation: '兒子',
    emergency_contact_phone: '7654-3210',
    district: '黃大仙區',
    responsible_worker: '陳社工',
    status: 'verified',
    is_pending_ai_review: 0,
    extracted_data: {
      basic_info: {
        name: '李婆婆', age: 72, gender: '女',
        address: '黃大仙區竹園南邨華園樓215室', phone: '4567-8901',
        living_arrangement: '與兒子一家同住',
        emergency_contact: { name: '李小明', relation: '兒子', phone: '7654-3210' }
      },
      medical_facts: [
        { type: 'diagnosis', name: '骨質疏鬆', value: '確診', date: '2022-05-10', source: '骨科門診記錄', evidence_text: '骨密度檢查 T-score -2.8', confidence: 0.95 },
        { type: 'diagnosis', name: '高血脂', value: '確診', date: '2023-01-15', source: '體檢報告', evidence_text: '血脂異常，飲食控制', confidence: 0.9 }
      ],
      function_facts: {
        fall_history: [],
        mobility: [{ description: '整體行動能力尚可', source: '社工評估' }],
        daily_living: [{ description: 'ADL獨立，但較少外出', source: '社工家訪記錄' }],
        cognition_communication: [],
        social_support: [{ description: '與家人同住，社交圈子較小', source: '長者自述' }]
      },
      missing_information: [],
      source_files: ['2023_骨科評估_李婆婆.pdf']
    }
  },
  {
    archive_no: 'ARC0004',
    name: '黃伯',
    age: 85,
    gender: '男',
    address: '香港新界葵青區葵涌邨合葵樓101室',
    phone: '5678-9012',
    id_number: 'D456789(0)',
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_contact_phone: '',
    district: '葵青區',
    responsible_worker: '陳社工',
    status: 'pending',
    is_pending_ai_review: 1,
    extracted_data: {
      basic_info: {
        name: '黃伯', age: 85, gender: '男',
        address: '葵青區葵涌邨合葵樓101室', living_arrangement: '獨居',
        emergency_contact: { name: '', relation: '', phone: '' }
      },
      medical_facts: [
        { type: 'diagnosis', name: '失智症', value: '確診', date: '2021-08-20', source: '精神科門診記錄', evidence_text: '中度阿茲海默症', confidence: 0.95 },
        { type: 'diagnosis', name: '高血壓', value: '確診', date: '2019-03-10', source: '普通科門診記錄', evidence_text: '高血壓病史', confidence: 0.9 },
        { type: 'self_report', name: '忘記服藥', value: '經常', source: '長者自述', evidence_text: '有時候會忘記是否已服藥', confidence: 0.7 }
      ],
      function_facts: {
        fall_history: [],
        mobility: [{ description: '行動基本自理', source: '社工評估' }],
        daily_living: [
          { description: '備餐有困難，經常外出買飯或不吃', source: '社工家訪記錄' }
        ],
        cognition_communication: [
          { description: '記憶力明顯下降，常忘記近期事件', source: '精神科評估' },
          { description: '有時忘記服藥或重複服藥', source: '社工家訪記錄' }
        ],
        social_support: [
          { description: '獨居，無子女，鄰居偶爾幫忙', source: '社工家訪記錄' },
          { description: '極少參加社交活動', source: '長者鄰居口述' }
        ]
      },
      missing_information: ['缺少緊急聯絡人資料', '缺少近期認知功能評估'],
      source_files: ['2021_精神科評估_黃伯.pdf']
    }
  },
  {
    archive_no: 'ARC0005',
    name: '張婆婆',
    age: 76,
    gender: '女',
    address: '香港香港島東區北角英皇道500號8樓B室',
    phone: '6789-0123',
    id_number: 'E567890(1)',
    emergency_contact_name: '張大文',
    emergency_contact_relation: '丈夫',
    emergency_contact_phone: '8765-4321',
    district: '東區',
    responsible_worker: '陳社工',
    status: 'pending',
    is_pending_ai_review: 1,
    extracted_data: {
      basic_info: {
        name: '張婆婆', age: 76, gender: '女',
        address: '東區北角英皇道500號8樓B室', phone: '6789-0123',
        living_arrangement: '與丈夫同住',
        emergency_contact: { name: '張大文', relation: '丈夫', phone: '8765-4321' }
      },
      medical_facts: [
        { type: 'diagnosis', name: '哮喘', value: '確診', date: '2005-01-01', source: '呼吸科門診記錄', evidence_text: '支氣管哮喘，使用吸入劑控制', confidence: 0.9 },
        { type: 'diagnosis', name: '骨質疏鬆', value: '確診', date: '2022-11-20', source: '骨質密度檢查', evidence_text: '腰椎骨密度下降', confidence: 0.9 }
      ],
      function_facts: {
        fall_history: [{ date: '2025-09-15', description: '在樓梯間跌倒，擦傷膝蓋', source: '長者自述' }],
        mobility: [{ description: '膝關節疼痛，長距離行走困難', source: '社工評估' }],
        daily_living: [{ description: '基本自理，但提重物困難', source: '社工家訪記錄' }],
        cognition_communication: [],
        social_support: [
          { description: '與丈夫同住，丈夫亦年邁需照顧', source: '社工家訪記錄' },
          { description: '丈夫近期身體轉差，照顧壓力增加', source: '社工家訪記錄' }
        ]
      },
      missing_information: ['缺少抑鬱篩查評估', '缺少照顧者壓力評估'],
      source_files: ['2025_北角綜合家居照顧服務評估_張婆婆.pdf']
    }
  },
  {
    archive_no: 'ARC0006',
    name: '林伯',
    age: 91,
    gender: '男',
    address: '香港九龍深水埗區南昌邨昌賢樓207室',
    phone: '',
    id_number: 'F678901(2)',
    emergency_contact_name: '林志明',
    emergency_contact_relation: '侄子',
    emergency_contact_phone: '5432-1987',
    district: '深水埗區',
    responsible_worker: '陳社工',
    status: 'pending',
    is_pending_ai_review: 1,
    extracted_data: {
      basic_info: {
        name: '林伯', age: 91, gender: '男',
        address: '深水埗區南昌邨昌賢樓207室', phone: '',
        living_arrangement: '獨居',
        emergency_contact: { name: '林志明', relation: '侄子', phone: '5432-1987' }
      },
      medical_facts: [
        { type: 'diagnosis', name: '慢阻肺', value: '確診', date: '2015-03-10', source: '呼吸科門診記錄', evidence_text: '慢性阻塞性肺病，需長期使用氧氣', confidence: 0.95 },
        { type: 'diagnosis', name: '心力衰竭', value: '確診', date: '2024-06-20', source: '心臟科門診記錄', evidence_text: '慢性心力衰竭，NYHA III級', confidence: 0.95 },
        { type: 'diagnosis', name: '痛風', value: '確診', date: '2020-01-05', source: '普通科門診記錄', evidence_text: '痛風病史，間歇性發作', confidence: 0.9 }
      ],
      function_facts: {
        fall_history: [{ date: '2026-01-10', description: '起床時暈眩跌倒，撞到床頭櫃', source: '急診記錄' }],
        mobility: [
          { description: '因慢阻肺導致行動氣促，需間歇休息', source: '長者健康中心評估' },
          { description: '使用拐杖輔助行走', source: '社工家訪記錄' }
        ],
        daily_living: [
          { description: '洗澡需協助', source: '社工家訪記錄' },
          { description: '外出購物困難', source: '長者自述' }
        ],
        cognition_communication: [],
        social_support: [
          { description: '獨居，侄子每月探望一次', source: '社工家訪記錄' }
        ]
      },
      missing_information: ['缺少社會支持網絡評估', '缺少抑鬱篩查'],
      source_files: ['2025_深水埗地區康健中心評估_林伯.pdf']
    }
  }
];

// 执行种子数据填充
async function seed() {
  console.log(`[Seed] 開始填充 ${seedElders.length} 條測試長者數據...`);
  
  // 加载规则库
  console.log('[Seed] 加載 JSON 規則庫...');
  const ruleResult = loadAllRules();
  console.log(`[Seed] 規則庫加載: ${ruleResult.success ? '全部成功' : '部分缺失'}`);
  if (ruleResult.missing.length > 0) {
    console.log(`[Seed] ⚠️  缺失文件: ${ruleResult.missing.join(', ')}`);
  }
  
  for (let i = 0; i < seedElders.length; i++) {
    const seedData = seedElders[i];
    
    // 创建长者
    const elder = db.createElder({
      name: seedData.name,
      age: seedData.age,
      gender: seedData.gender,
      address: seedData.address,
      phone: seedData.phone,
      id_number: seedData.id_number,
      emergency_contact_name: seedData.emergency_contact_name,
      emergency_contact_relation: seedData.emergency_contact_relation,
      emergency_contact_phone: seedData.emergency_contact_phone,
      district: seedData.district,
      responsible_worker: seedData.responsible_worker,
      status: seedData.status || 'pending',
      is_pending_ai_review: seedData.is_pending_ai_review !== undefined ? seedData.is_pending_ai_review : 1,
      extracted_data: seedData.extracted_data,
      assessment_date: '2026-05-20'
    });
    
    console.log(`[Seed] 已創建: ${elder.name} (${elder.id})`);
    
    // 创建材料记录
    if (seedData.extracted_data && seedData.extracted_data.source_files) {
      for (const fileName of seedData.extracted_data.source_files) {
        db.createMaterial({
          elder_id: elder.id,
          file_name: fileName,
          file_type: 'pdf',
          file_size: 1024 * 100, // 模拟
          file_path: `/seed/${fileName}`,
          source_type: 'seed',
          extracted_data: seedData.extracted_data,
          status: 'completed'
        });
      }
    }
    
    // 运行规则计算
    const chronicDetails = evaluateChronicDiseases(seedData.extracted_data);
    db.saveChronicDiseaseDetails(elder.id, chronicDetails);
    
    const healthTags = chronicDetails.filter(d => d.counted_as_chronic).map(d => d.disease_name);
    
    const riskResult = evaluateRisk(seedData.extracted_data, chronicDetails);
    db.saveRiskDimensions(elder.id, riskResult.dimensions);
    
    const riskLevelMap = { high: 'high', medium: 'medium', low: 'low' };
    
    const recommendations = matchRecommendations(seedData.extracted_data, chronicDetails, riskResult);
    db.saveRecommendations(elder.id, recommendations);
    
    const updatedElder = db.getElderById(elder.id);
    const resources = matchResources(updatedElder, chronicDetails, riskResult);
    db.saveResourceRecommendations(elder.id, resources);
    
    // 更新长者档案
    db.updateElder(elder.id, {
      risk_level: riskLevelMap[riskResult.overall_risk] || 'pending',
      overall_risk_level: riskResult.overall_risk,
      health_tags: healthTags
    });
    
    console.log(`[Seed]   - 慢病標籤: ${healthTags.join(', ') || '無'}`);
    console.log(`[Seed]   - 風險等級: ${riskResult.overall_risk}`);
    console.log(`[Seed]   - 建議數: ${recommendations.length}`);
    console.log(`[Seed]   - 資源數: ${resources.length}`);
  }
  
  console.log('[Seed] ✅ 種子數據填充完成');
}

seed().catch(error => {
  console.error('[Seed] ❌ 錯誤:', error);
  process.exit(1);
});
