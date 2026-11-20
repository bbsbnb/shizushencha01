import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { execFile, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(docx|doc|pdf)$/i.test(file.originalname);
    if (!ok) return cb(new Error('仅支持 .doc / .docx / .pdf 文件'));
    cb(null, true);
  },
});

app.use(express.json({ limit: '50mb' }));

// 生产模式：提供前端构建产物
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 上传文件（支持多文件，字段名 files）
app.post('/api/upload', (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: '单个文件不能超过 500 MB，请压缩或拆分后重新上传。' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '未收到文件，请使用字段名 files 上传' });
    }
    res.json({
      files: req.files.map((f) => ({
        // 浏览器以 UTF-8 发送文件名，multipart 解析器默认按 Latin-1 解码。
        name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
        size: f.size,
        savedAs: f.filename,
      })),
    });
  });
});

function findPython() {
  for (const cmd of ['python', 'python3']) {
    try {
      execFileSync(cmd, ['--version']);
      return cmd;
    } catch { /* try next */ }
  }
  return null;
}

// 仅提取本次上传目录中的文件。
app.post('/api/extract', (req, res) => {
  const { file } = req.body || {};
  if (!file) return res.status(400).json({ error: '缺少已上传文件标识 file' });
  const target = path.join(uploadDir, path.basename(file));
  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: `文件不存在：${target}` });
  }
  const py = findPython();
  if (!py) {
    return res.status(500).json({ error: '未找到 python，无法提取文件文本' });
  }
  const pyScript = path.join(__dirname, 'extract.py');
  const child = execFile(py, [pyScript, target], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      const msg = (stderr || err.message || '').trim();
      return res.status(400).json({ error: `文本提取失败：${msg}` });
    }
    res.json({ text: stdout, bytes: Buffer.byteLength(stdout, 'utf8') });
  });
  child.on('error', () => {
    res.status(500).json({ error: 'python 执行异常' });
  });
});

// LLM 审核调用（代理）：body = { apiKey, baseUrl?, model?, system?, user?, files? }
// 兼容 OpenAI 风格 chat/completions 接口
app.post('/api/audit', async (req, res) => {
  const { apiKey, baseUrl, model, system, user, temperature, maxTokens } = req.body || {};
  if (!apiKey) {
    return res.status(400).json({ error: '缺少 apiKey（前端需在设置中配置 LLM API Key）' });
  }
  if (!model) {
    return res.status(400).json({ error: '缺少 model 参数' });
  }
  if (temperature != null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
    return res.status(400).json({ error: '温度须在 0～2 之间，建议设为 0.2。' });
  }
  if (maxTokens != null && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32768)) {
    return res.status(400).json({ error: '本项目最大输出 token 须为 1～32768 的整数，建议设为 4000；同时不能超过所选模型的限制。' });
  }
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const payload = {
    model,
    messages: [
      { role: 'system', content: system || '你是工程施工组织设计（方案）审核专家。' },
      { role: 'user', content: user || '' },
    ],
    temperature: temperature ?? 0.2,
    max_tokens: maxTokens ?? 4000,
    response_format: { type: 'json_object' },
  };
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const reason = data.error?.message || (typeof data.error === 'string' ? data.error : '') || data.message || '请检查模型名称、参数及接口兼容性。';
      return res.status(resp.status).json({
        error: `LLM 调用失败（${resp.status}）：${reason}`,
        detail: data,
      });
    }
    const content = data.choices?.[0]?.message?.content ?? '';
    // 尝试解析 JSON；LLM 有时会在 JSON 前后带 ```json 代码块
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch { /* keep raw */ }
      }
    }
    res.json({
      content,
      parsed,
      usage: data.usage,
      model: data.model,
    });
  } catch (e) {
    res.status(500).json({ error: `LLM 网络调用失败：${e.message}` });
  }
});

// 获取内置提示词
app.get('/api/prompt', (req, res) => {
  res.type('text/plain').send(fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8'));
});

app.listen(PORT, () => {
  console.log(`[construction-audit-app] backend on http://localhost:${PORT}`);
});
