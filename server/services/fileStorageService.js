// 文件存储服务 - 处理文件上传和保存
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function saveFile(file) {
  ensureUploadDir();
  
  const ext = path.extname(file.originalname);
  const uniqueName = `${uuidv4()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, uniqueName);
  
  // multer 已经保存了文件，这里只需要返回信息
  // 如果文件是直接通过 multer 保存的，使用 file.path
  const finalPath = file.path || filePath;
  
  return {
    originalName: file.originalname,
    storedName: path.basename(finalPath),
    path: finalPath,
    size: file.size,
    mimetype: file.mimetype || file.mimetype
  };
}

function getFilePath(filename) {
  return path.join(UPLOAD_DIR, filename);
}

function deleteFile(filename) {
  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

module.exports = {
  saveFile,
  getFilePath,
  deleteFile,
  UPLOAD_DIR
};
