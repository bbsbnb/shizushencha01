// 前端 API 封装与设置存储
const LS_KEY = 'construction-audit-settings';

export const defaultSettings = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  maxTokens: 4000,
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify({ ...defaultSettings, ...s }));
}

function validateModelSettings(settings) {
  if (!Number.isFinite(settings.temperature) || settings.temperature < 0 || settings.temperature > 2) {
    throw new Error('温度须在 0～2 之间，建议设为 0.2。');
  }
  if (!Number.isInteger(settings.maxTokens) || settings.maxTokens < 1 || settings.maxTokens > 32768) {
    throw new Error('本项目最大输出 token 须为 1～32768 的整数，建议设为 4000；同时不能超过所选模型的限制。');
  }
}

async function j(resp) {
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

// 上传文件（字段 files，多文件）
export function uploadFiles(files, onProgress) {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.upload.addEventListener('progress', (event) => {
      onProgress?.(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : -1);
    });
    xhr.upload.addEventListener('load', () => onProgress?.(100));
    xhr.addEventListener('load', () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* keep empty response */ }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data.error || `HTTP ${xhr.status}`));
        return;
      }
      resolve(data);
    });
    xhr.addEventListener('error', () => reject(new Error('网络错误，请检查连接后重试。')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消。')));
    onProgress?.(-1);
    xhr.send(fd);
  });
}

// 提取文本（已上传文件 savedAs 列表）
export async function extractTexts(savedAsList) {
  const out = [];
  for (const savedAs of savedAsList) {
    const data = await j(await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: savedAs }),
    }));
    out.push(data.text);
  }
  return out;
}

// 获取系统提示词
export async function getSystemPrompt() {
  const resp = await fetch('/api/prompt');
  return resp.text();
}

// 组装用户消息并调用 LLM 审核
export async function runAudit({ texts, fileNames, settings, focusNote }) {
  validateModelSettings(settings);
  const system = await getSystemPrompt();
  const userParts = [];
  userParts.push(`以下提供 ${texts.length} 份待审核的施工组织设计（方案）文件，请逐文件审核并输出规定 JSON。`);
  texts.forEach((t, i) => {
    userParts.push(`\n===== 文件 ${i + 1}：${fileNames[i] || '未命名'} =====\n${t.slice(0, 60000)}`);
  });
  if (focusNote) userParts.push(`\n用户附加说明：${focusNote}`);
  const data = await j(
    await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        system,
        user: userParts.join('\n'),
      }),
    }),
  );
  if (data.parsed) return data.parsed;
  // 解析失败兜底
  return {
    projectName: '（模型返回非结构化内容）',
    auditDate: new Date().toISOString().slice(0, 10),
    overall: { conclusion: '基本合格，需修改后实施', summary: data.content?.slice(0, 300) || '原始内容见对话区' },
    dimensions: [],
    rawContent: data.content,
  };
}

// 对话追问（多轮）
export async function runChat({ history, settings }) {
  validateModelSettings(settings);
  const system = '你是施工组织设计（方案）审核专家。基于已完成的审核结果回答用户追问，引用规范须具体到条文，回答简洁专业。';
  const data = await j(
    await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: 0.3,
        maxTokens: 1500,
        system,
        user: history
          .map((m) => (m.role === 'user' ? m.content : `（前文审核结论摘录）\n${m.content}`))
          .join('\n\n') +
          '\n\n请回答用户最新问题。',
      }),
    }),
  );
  return data.content;
}

// 导出 Word（HTML 兼容 .doc）
export function exportWord(audit, title) {
  const s = (v) => (v == null ? '' : String(v));
  const dimRows = (audit.dimensions || [])
    .map(
      (d) => `
      <h3>${d.id}.${d.name}</h3>
      <p>评价：${d.rating}</p>
      <ul>${(d.issues || [])
        .map((i) => `<li>[${i.severity}] ${s(i.title)}<br>违反条款：${s(i.clause)}<br>整改要求：${s(i.requirement)}</li>`)
        .join('')}</ul>
      ${d.highlight ? `<p><b>重点提示：</b>${s(d.highlight)}</p>` : ''}`
    )
    .join('');
  const keyHtml = (audit.keyIssues || [])
    .map(
      (k) => `
      <h3>【重点问题】${s(k.title)}（${k.severity}）</h3>
      <p><b>问题描述：</b>${s(k.description)}</p>
      <p><b>存在风险：</b>${(k.risks || []).map((r, i) => `${i + 1}. ${r}`).join('<br>')}</p>
      <p><b>整改要求：</b>${(k.requirements || []).map((r, i) => `${i + 1}. ${r}`).join('<br>')}</p>
      <p><b>整改时限：</b>${s(k.deadline)}<br><b>依据：</b>${s(k.basis)}</p>`
    )
    .join('');
  const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:"Microsoft YaHei",SimSun,sans-serif;font-size:11pt;color:#222}h1{color:#1f4e79}h3{color:#1f4e79}table{border-collapse:collapse}li{margin:4px 0}</style>
  </head><body>
  <h1>审核意见书</h1>
  <p>工程名称：${s(audit.projectName)}<br>审核内容：施工组织设计 / 施工方案<br>审核日期：${s(audit.auditDate)}<br>工程类型：${(audit.projectTypes || []).join('、') || '—'}</p>
  <h2>一、总体评价</h2>
  <p>审核结论：${s(audit.overall?.conclusion)}</p>
  <p>${s(audit.overall?.summary)}</p>
  <h2>二、分项审核意见</h2>
  ${dimRows}
  <p><i>${(audit.specialNotes || []).join('；')}</i></p>
  <h2>三、重点问题详细说明</h2>
  ${keyHtml || '<p>无致命/严重级重点问题。</p>'}
  <h2>四、审核结论</h2>
  <p>${s(audit.finalConclusion?.choice)}</p>
  <ul>${(audit.finalConclusion?.items || []).map((i) => `<li>${s(i)}</li>`).join('')}</ul>
  ${audit.citationNote ? `<p><i>规范核验说明：${s(audit.citationNote)}</i></p>` : ''}
  ${audit.consistencyCheck && audit.consistencyCheck !== '不适用' ? `<h2>五、跨文件汇总意见</h2><p>${s(audit.consistencyCheck)}</p><p>${s(audit.crossSummary)}</p>` : ''}
  <p>审核人：施工组织设计（方案）AI 审核智能体<br>审核日期：${s(audit.auditDate)}</p>
  </body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `审核意见书_${title}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}
