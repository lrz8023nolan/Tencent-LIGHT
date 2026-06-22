# ============================================
# 智能长者个案管理系统 - Docker 镜像
# 国内用户通过 ARG 指定镜像源：docker build --build-arg REGISTRY_PREFIX=docker.m.daocloud.io/ -t light-demo .
# 可选镜像: docker.1ms.run, docker.m.daocloud.io
# ============================================
ARG REGISTRY_PREFIX=docker.m.daocloud.io/
FROM ${REGISTRY_PREFIX}library/node:22

WORKDIR /app

# 先只复制依赖文件，利用 Docker 层缓存
COPY server/package.json server/package-lock.json ./

# 安装生产依赖（npm 镜像加速）
RUN npm config set registry https://registry.npmmirror.com \
    && npm ci --production

# 复制服务端代码
COPY server/ ./

# 复制前端文件到 /frontend（与 server app.js 中 path.join(__dirname, '..', 'frontend') 对应）
COPY frontend/ /frontend/

# better-sqlite3 强制从源码编译（在 COPY 之后执行，避免预编译二进制被覆盖）
RUN rm -f node_modules/better-sqlite3/build/Release/better_sqlite3.node \
    && cd node_modules/better-sqlite3 \
    && npx --yes node-gyp rebuild

# 确保运行时目录存在
RUN mkdir -p uploads db

EXPOSE 3001

CMD ["node", "app.js"]
