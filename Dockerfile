# 使用完整的 Debian Trixie Node 环境，自带 git 等工具
FROM node:24.14.0-trixie

# 全局安装 VibeGo
RUN npm install -g vibego@latest

# 设置工作目录
WORKDIR /home/project

# 暴露端口
EXPOSE 1984

# 启动服务
CMD ["vibego"]
