// 数据库初始化脚本
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'elder_care.db');

function initDatabase() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  
  // 启用 WAL 模式提高并发性能
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 读取并执行 schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  console.log(`[DB] 数据库初始化完成: ${DB_PATH}`);
  return db;
}

// 如果直接运行此脚本
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  initDatabase();
  console.log('[DB] Schema 已创建');
  process.exit(0);
}

module.exports = { initDatabase, DB_PATH };
