import React, { useState, useRef, useEffect } from 'react';
import { getSettings, saveSettings, uploadFiles, extractTexts, runAudit, runChat, exportWord } from './api.js';
import { sampleAudit, sampleChat, severityOrder } from './data/sample.js';

const NAV = [
  { key: 'upload', label: '文件上传', icon: '⬆' },
  { key: 'dimensions', label: '八维度审核', icon: '▦' },
  { key: 'severity', label: '等级看板', icon: '◆' },
  { key: 'keyissues', label: '重点问题', icon: '⚑' },
  { key: 'conclusion', label: '审核结论', icon: '✓' },
  { key: 'chat', label: '追问对话', icon: '◌' },
  { key: 'export', label: '导出打印', icon: '⭳' },
];

const SEV_COLOR = {
  致命: '#c0392b',
  严重: '#e67e22',
  一般: '#e1a70f',
  建议: '#5b8c5a',
};

export default function App() {
  const [settings, setSettings] = useState(getSettings());
  const [active, setActive] = useState('upload');
  const [files, setFiles] = useState([]); // {name, savedAs, size}
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadOk, setUploadOk] = useState('');
  const [audit, setAudit] = useState(sampleAudit);
  const [isSample, setIsSample] = useState(true);
  const [chat, setChat] = useState(sampleChat);
  const [progress, setProgress] = useState(null); // {step, total, msg} | null
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const focusRef = useRef('');

  const setSettingsAndSave = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  async function startAudit() {
    if (!files.length) {
      setError('请先上传至少一份施工组织设计（方案）文件。');
      return;
    }
    if (!settings.apiKey) {
      setShowSettings(true);
      setError('需要配置 LLM API Key 后才能调用真实审核。');
      return;
    }
    setError('');
    setBusy(true);
    setProgress({ step: 0, total: 2, msg: '正在提取文件文本，请稍候…' });
    try {
      const texts = await extractTexts(files.map((f) => f.savedAs));
      setProgress({ step: 1, total: 2, msg: '正在调用模型审核，请稍候…' });
      const result = await runAudit({
        texts,
        fileNames: files.map((f) => f.name),
        settings,
        focusNote: focusRef.current,
      });
      setAudit(result);
      setIsSample(false);
      setChat([]);
      setActive('dimensions');
    } catch (e) {
      setError(e.message || '审核失败，请检查网络或 API 配置。');
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  // 上传处理（点击选择 + 拖拽共用）
  async function handleFiles(fileList) {
    const fl = Array.from(fileList || []);
    if (!fl.length) return;
    setError('');
    setUploadOk('');
    if (fl.some((f) => f.size > 500 * 1024 * 1024)) {
      setError('单个文件不能超过 500 MB，请压缩或拆分后重新上传。');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const data = await uploadFiles(fl, setUploadProgress);
      setFiles((prev) => [...prev, ...data.files]);
      setUploadOk(`已上传 ${data.files.length} 份文件：${data.files.map((f) => f.name).join('、')}`);
    } catch (e) {
      setError(`上传失败：${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    const history = [...chat, { role: 'user', content: userMsg }];
    setChat(history);
    setChatInput('');
    setBusy(true);
    try {
      if (settings.apiKey) {
        const answer = await runChat({ history, settings });
        setChat([...history, { role: 'assistant', content: answer }]);
      } else {
        setChat([...history, { role: 'assistant', content: '（未配置 API Key，无法调用模型。可在"设置"中填入 LLM API Key 后再追问。）' }]);
      }
    } catch (e) {
      setChat([...history, { role: 'assistant', content: `追问失败：${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">施审</div>
          <div>
            <div className="brand-title">施工组织设计</div>
            <div className="brand-sub">方案审核智能体</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${active === n.key ? 'on' : ''}`} onClick={() => setActive(n.key)}>
              <span className="nav-ico">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button className="mini-btn" onClick={() => setShowSettings((v) => !v)}>{showSettings ? '收起设置' : '⚙ 设置'}</button>
          {showSettings && <SettingsPanel settings={settings} onChange={setSettingsAndSave} />}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{NAV.find((n) => n.key === active)?.label}</h1>
            <p className="sub">{isSample ? '当前展示示例数据（未接入真实文件）' : `已审核 ${files.length} 份文件 · ${audit.projectName}`}</p>
          </div>
          <button className="btn primary" onClick={() => (active === 'upload' ? startAudit() : setActive('upload'))} disabled={busy}>
            {busy ? '审核中…' : '开始审核'}
          </button>
        </header>

        <div className="status-area" aria-live="polite" aria-busy={Boolean(progress)}>
        {progress && (
          <div className="progress-wrap">
            <div className="progress-msg">{progress.msg}</div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${(progress.step / progress.total) * 100}%` }} /></div>
          </div>
        )}
        {error && <div className="alert">⚠ {error}</div>}
        </div>

        <section className="content">
          {active === 'upload' && (
            <UploadPanel files={files} onFiles={handleFiles} uploading={uploading} uploadProgress={uploadProgress} uploadOk={uploadOk} removeOne={(i) => setFiles((p) => p.filter((_, k) => k !== i))} focusRef={focusRef} />
          )}
          {active === 'dimensions' && <DimensionsPanel audit={audit} />}
          {active === 'severity' && <SeverityPanel audit={audit} />}
          {active === 'keyissues' && <KeyIssuesPanel audit={audit} />}
          {active === 'conclusion' && <ConclusionPanel audit={audit} />}
          {active === 'chat' && (
            <ChatPanel chat={chat} busy={busy} onSend={sendChat} input={chatInput} setInput={setChatInput} />
          )}
          {active === 'export' && (
            <ExportPanel audit={audit} isSample={isSample} onExport={() => exportWord(audit, audit.projectName || '施工组织设计')} />
          )}
        </section>
      </main>
    </div>
  );
}

function SettingsPanel({ settings, onChange }) {
  return (
    <div className="settings">
      <div className="set-title">LLM 调用设置</div>
      <label>API Key</label>
      <input type="password" value={settings.apiKey} onChange={(e) => onChange({ apiKey: e.target.value })} placeholder="sk-…" />
      <label>Base URL</label>
      <input type="text" value={settings.baseUrl} onChange={(e) => onChange({ baseUrl: e.target.value })} />
      <label>模型</label>
      <input type="text" value={settings.model} onChange={(e) => onChange({ model: e.target.value })} placeholder="gpt-4o-mini / qwen-plus / deepseek-chat…" />
      <label>温度（0～2，建议 0.2）</label>
      <input type="number" step="0.1" min="0" max="2" value={settings.temperature} onChange={(e) => onChange({ temperature: Number(e.target.value) })} />
      <label>最大输出 token（建议 4000）</label>
      <input type="number" min="1" max="32768" step="1" value={settings.maxTokens} onChange={(e) => onChange({ maxTokens: Number(e.target.value) })} />
      <p className="set-tip">Key 仅保存在本地浏览器 localStorage，随请求由后端代理调用，不会写入代码仓库。</p>
    </div>
  );
}

function UploadPanel({ files, onFiles, uploading, uploadProgress, uploadOk, removeOne, focusRef }) {
  const [focus, setFocus] = useState('');
  const [dragOver, setDragOver] = useState(false);

  function onDrop(ev) {
    ev.preventDefault();
    setDragOver(false);
    const dt = ev.dataTransfer;
    if (dt && dt.files && dt.files.length) onFiles(dt.files);
  }
  function onDragOver(ev) { ev.preventDefault(); setDragOver(true); }
  function onDragLeave(ev) { ev.preventDefault(); setDragOver(false); }

  return (
    <div className="card">
      <div className="card-h">文件上传（支持 .doc / .docx / .pdf，可多文件）</div>
      <label
        className={`dropzone ${dragOver ? 'drag' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="dz-big">⬆</div>
        <div>{uploading ? '正在上传，请稍候…' : '点击选择 或 拖拽文件到此处'}</div>
        <div className="dz-sub">支持一次多份：总施工组织设计 + 多个专项方案；单个文件最大 500 MB，每次最多 10 份</div>
        <input type="file" multiple accept=".doc,.docx,.pdf" onChange={(e) => onFiles(e.target.files)} style={{ display: 'none' }} />
      </label>
      {uploading && (
        <div className="upload-progress" role="status" aria-live="polite">
          <div className="upload-progress-label"><span>{uploadProgress < 0 ? '正在发送文件…' : '正在上传文件…'}</span><span>{uploadProgress < 0 ? '' : `${uploadProgress}%`}</span></div>
          <div className="upload-progress-track" role="progressbar" aria-label="文件上传进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress < 0 ? undefined : uploadProgress} aria-busy="true">
            <div className={`upload-progress-fill ${uploadProgress < 0 ? 'indeterminate' : ''}`} style={uploadProgress < 0 ? undefined : { width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}
      {uploadOk && <div className="upload-ok">✓ {uploadOk}</div>}
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={i}>
              <span className="file-ico">📄</span>
              <span className="file-name">{f.name}</span>
              <span className="file-size">{(f.size / (1024 * 1024)).toFixed(2)} MB</span>
              <button className="x" onClick={() => removeOne(i)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="focus-box">
        <label>聚焦说明（可选）</label>
        <textarea value={focus} onChange={(e) => { focusRef.current = e.target.value; }} placeholder="例如：本次重点审核深基坑与顶管专项安全方案" rows="2" />
      </div>
    </div>
  );
}

function DimensionsPanel({ audit }) {
  return (
    <div className="stack">
      {(audit.dimensions || []).length === 0 && <div className="empty">暂无维度数据。{audit.rawContent ? '（模型返回非结构化内容，见对话区）' : ''}</div>}
      {(audit.dimensions || []).map((d) => (
        <div className="card dim" key={d.id}>
          <div className="dim-h">
            <span className="dim-idx">{d.id}</span>
            <span className="dim-name">{d.name}</span>
            <div className="rating">
              {d.ratingOptions?.map((o) => (
                <span key={o} className={`rt ${o === d.rating ? 'on' : ''}`}>{o === d.rating ? '■' : '□'} {o}</span>
              ))}
            </div>
          </div>
          {(d.issues?.length || 0) > 0 ? (
            <ul className="issues">
              {d.issues.map((i, k) => (
                <li key={k} className="issue">
                  <div className="issue-t">
                    <span className="sev" style={{ background: SEV_COLOR[i.severity] }}>{i.severity}</span>
                    <span>{i.title}</span>
                  </div>
                  {i.clause && <div className="issue-m">违反条款：{i.clause}</div>}
                  {i.requirement && <div className="issue-m">整改要求：{i.requirement}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="no-issue">未发现明显问题</div>
          )}
          {d.highlight && <div className="highlight"><b>重点提示：</b>{d.highlight}</div>}
        </div>
      ))}
      {audit.specialNotes?.length > 0 && (
        <div className="card notes">
          <div className="card-h">专业专项裁剪说明</div>
          <ul>{audit.specialNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function SeverityPanel({ audit }) {
  const counts = {};
  severityOrder.forEach((s) => (counts[s] = 0));
  (audit.dimensions || []).forEach((d) => (d.issues || []).forEach((i) => { if (i.severity in counts) counts[i.severity] += 1; }));
  const total = severityOrder.reduce((a, s) => a + counts[s], 0);
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="stack">
      <div className="card">
        <div className="card-h">问题严重等级统计（共 {total} 项）</div>
        <div className="sev-grid">
          {severityOrder.map((s) => (
            <div className="sev-cell" key={s}>
              <div className="sev-num" style={{ color: SEV_COLOR[s] }}>{counts[s]}</div>
              <div className="sev-label">{s}</div>
              <div className="sev-bar"><div style={{ width: `${(counts[s] / max) * 100}%`, background: SEV_COLOR[s] }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-h">按等级分组问题列表</div>
        {severityOrder.map((s) => {
          const items = [];
          (audit.dimensions || []).forEach((d) => (d.issues || []).forEach((i) => { if (i.severity === s) items.push({ ...i, dim: d.name }); }));
          if (!items.length) return null;
          return (
            <div key={s} className="sev-group">
              <div className="sev-group-h"><span className="sev" style={{ background: SEV_COLOR[s] }}>{s}</span> {items.length} 项</div>
              <ul>{items.map((i, k) => <li key={k}><span className="dim-tag">{i.dim}</span> {i.title}</li>)}</ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KeyIssuesPanel({ audit }) {
  const list = audit.keyIssues || [];
  return (
    <div className="stack">
      {list.length === 0 && <div className="empty">无致命 / 严重级重点问题。</div>}
      {list.map((k, i) => (
        <div className="card key" key={i}>
          <div className="dim-h">
            <span className="sev" style={{ background: SEV_COLOR[k.severity] }}>{k.severity}</span>
            <span className="dim-name">{i + 1}. {k.title}</span>
          </div>
          <p><b>问题描述：</b>{k.description}</p>
          <div><b>存在风险：</b>
            <ol>{(k.risks || []).map((r, x) => <li key={x}>{r}</li>)}</ol>
          </div>
          <div><b>整改要求：</b>
            <ol>{(k.requirements || []).map((r, x) => <li key={x}>{r}</li>)}</ol>
          </div>
          <p><b>整改时限：</b>{k.deadline}　<b>依据：</b>{k.basis}</p>
        </div>
      ))}
    </div>
  );
}

function ConclusionPanel({ audit }) {
  const o = audit.overall || {};
  const f = audit.finalConclusion || {};
  return (
    <div className="stack">
      <div className="card overall">
        <div className="card-h">总体评价</div>
        <div className="oc-row">
          <div className="oc-label">审核结论</div>
          <div className="oc-value">{o.conclusion}</div>
        </div>
        <p>{o.summary}</p>
      </div>
      <div className="card">
        <div className="card-h">最终审核结论</div>
        <div className="oc-row"><div className="oc-label">结论</div><div className="oc-value">{f.choice}</div></div>
        {(f.items?.length || 0) > 0 && <ol>{f.items.map((i, x) => <li key={x}>{i}</li>)}</ol>}
      </div>
      {audit.citationNote && <div className="card note"><div className="card-h">规范核验说明</div><p>{audit.citationNote}</p></div>}
      {audit.consistencyCheck && audit.consistencyCheck !== '不适用' && (
        <div className="card"><div className="card-h">跨文件汇总</div>
          <p><b>一致性核查：</b>{audit.consistencyCheck}</p>
          <p><b>重大问题汇总：</b>{audit.crossSummary}</p>
          {audit.remediationPriority && <p><b>整改优先级：</b>{audit.remediationPriority}</p>}
        </div>
      )}
      <div className="sign">审核人：施工组织设计（方案）AI 审核智能体　　审核日期：{audit.auditDate}</div>
    </div>
  );
}

function ChatPanel({ chat, busy, onSend, input, setInput }) {
  const boxRef = useRef(null);
  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' }); }, [chat]);
  return (
    <div className="chat-wrap">
      <div className="chat-box" ref={boxRef}>
        {chat.length === 0 && <div className="empty">上传并审核文件后，可在此追问具体问题的规范依据、风险分析与整改做法。</div>}
        {chat.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="msg-role">{m.role === 'user' ? '你' : '审核智能体'}</div>
            <div className="msg-body">{m.content}</div>
          </div>
        ))}
        {busy && <div className="typing">…</div>}
      </div>
      <div className="chat-input">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入追问，例如：请说明顶管专家论证的组织要求与时限" rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} />
        <button className="btn primary" onClick={onSend} disabled={busy}>发送</button>
      </div>
    </div>
  );
}

function ExportPanel({ audit, isSample, onExport }) {
  return (
    <div className="card">
      <div className="card-h">导出 / 打印审核意见书</div>
      <p>{isSample ? '当前为示例数据，导出内容将基于示例结果。' : '将按固定模板生成 Word 版（.doc）审核意见书。'}</p>
      <div className="export-actions">
        <button className="btn" onClick={onExport}>导出 Word（.doc）</button>
        <button className="btn" onClick={() => window.print()}>打印</button>
      </div>
      <p className="set-tip">Word 导出采用 HTML 兼容格式，可用 Microsoft Word / WPS 直接打开。</p>
    </div>
  );
}
