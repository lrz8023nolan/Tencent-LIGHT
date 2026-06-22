// OCR 和文本提取服务
// 支持 PDF 文本提取和图片 OCR
const fs = require('fs');
const path = require('path');

// PDF 文本提取
async function extractPdfText(filePath) {
  try {
    // 尝试使用 pdf-parse 库
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text || '';
  } catch (error) {
    console.log('[OCR] pdf-parse 不可用，使用基础文本提取:', error.message);
    // 降级：尝试从 PDF 中提取文本（基础方式）
    return extractPdfTextFallback(filePath);
  }
}

// PDF 文本提取降级方案
function extractPdfTextFallback(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // 尝试提取可读文本
    const textMatches = content.match(/\(([^)]+)\)/g) || [];
    const text = textMatches.map(m => m.slice(1, -1)).join(' ');
    
    if (text.length > 50) {
      return text;
    }
    
    // 如果降级提取不到足够文字，返回文件信息
    return `[PDF文件] ${path.basename(filePath)}\n文件大小: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB\n（提示：安裝 pdf-parse 以獲得更好的 PDF 文本提取效果）`;
  } catch (error) {
    return `[無法提取文字] ${path.basename(filePath)}: ${error.message}`;
  }
}

// 图片 OCR
async function ocrImage(filePath) {
  try {
    // 尝试使用 tesseract.js
    const Tesseract = require('tesseract.js');
    const { data } = await Tesseract.recognize(filePath, 'chi_tra+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          // 进度可选记录
        }
      }
    });
    return data.text || '';
  } catch (error) {
    console.log('[OCR] tesseract.js 不可用，返回文件信息:', error.message);
    return `[圖片文件] ${path.basename(filePath)}\n文件大小: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB\n（提示：安裝 tesseract.js 以獲得 OCR 文字識別功能）`;
  }
}

// 提取文本文件内容（txt 等）
function extractTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return `[無法讀取文件] ${path.basename(filePath)}: ${error.message}`;
  }
}

// 根据文件类型提取文本
async function extractText(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.pdf') {
    return await extractPdfText(filePath);
  } else if (['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'].includes(ext)) {
    return await ocrImage(filePath);
  } else if (['.txt', '.csv', '.md'].includes(ext)) {
    return extractTextFile(filePath);
  } else {
    // 尝试作为文本文件读取
    return extractTextFile(filePath);
  }
}

module.exports = {
  extractText,
  extractPdfText,
  ocrImage
};
