# 工程施工组织设计（方案）审核智能体 · 前后端可视化项目

基于 Agnes「construction-org-audit」Skill 同源提示词，提供：
- **前端**：React + Vite，蓝灰政务商务风，左侧功能导航 + 右侧主内容区，含逐维度进度动效
- **后端**：Node + Express，① 调用系统 Python 提取 Word(.doc/.docx)/PDF 文本 ② 代理调用 LLM API（OpenAI 风格）
- **API Key**：前端设置面板配置（存 localStorage），随请求由后端代理调用，不硬编码进代码
- **示例数据**：内置一份模拟审核结果，打开即有内容可看（无需 Key）

## 目录结构
```
construction-audit-app/
├── index.html              # Vite 入口
├── vite.config.js          # 开发代理 /api → :3001
├── package.json
├── server/
│   ├── server.js           # Express：upload / extract / audit(LLM代理) / prompt / 静态托管 dist
│   ├── extract.py          # Python：docx/doc/pdf 文本提取
│   └── prompt.md           # 系统提示词（同源 Skill，JSON 结构化输出）
└── src/
    ├── main.jsx
    ├── App.jsx             # 布局 + 各功能模块组件
    ├── api.js              # 前端 API 封装 / 设置存储 / 导出 Word
    ├── data/sample.js      # 示例审核数据 + 示例对话
    └── styles.css          # 蓝灰商务风样式
```

## 运行
```bash
cd construction-audit-app
npm install
npm run build        # 构建前端到 dist/
npm start            # 生产模式：http://localhost:3001（后端同时托管 dist）
```

或开发模式（热更新）：
```bash
npm run dev          # 前端 :5173 + 后端 :3001（/api 自动代理）
```

## 使用
1. 打开页面 → 左侧"设置"填入 LLM API Key / Base URL / 模型（兼容 OpenAI 风格接口）。
2. "文件上传"拖入 .doc / .docx / .pdf（可多份：总施工组织设计 + 多个专项方案）。
3. 点"开始审核"：逐维度进度动效 → 解析文件 → 调用 LLM → 输出结构化审核结果。
4. 左侧导航查看：八维度审核 / 等级看板（致命·严重·一般·建议统计）/ 重点问题 / 审核结论 / 追问对话 / 导出打印。
5. "追问对话"可多轮深入某条问题的规范依据、风险分析与整改做法。
6. "导出打印"生成 Word(.doc) 版审核意见书，或打印。

## 依赖
- Node.js 18+，npm
- Python 3，以及文档提取依赖：`python -m pip install pypdf python-docx olefile`
- 一个 OpenAI 风格 LLM API 端点

## 说明
- 未配置 API Key 时，页面展示内置示例数据，功能界面完整可用；真实审核需填入 Key。
- 导出 Word 采用 HTML 兼容格式，Microsoft Word / WPS 可直接打开。
- Cloudflare Quick Tunnel 会创建公网可访问的临时链接。公开分享链接前，请勿上传敏感文件或在共享浏览器中保存 API Key。
