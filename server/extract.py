# -*- coding: utf-8 -*-
"""施工组织设计文件文本提取脚本
输入：文件路径（argv[1]）
输出：stdout 文本（docx 段落 / doc UTF-16 文本区段 / pdf 文本层），失败时 stderr 并退出码 1
支持格式：.docx / .doc(OLE 二进制) / .pdf
"""
import sys, os, re, zipfile


def extract_docx(path):
    from docx import Document
    doc = Document(path)
    parts = []
    for p in doc.paragraphs:
        t = p.text.strip()
        if t:
            parts.append(t)
    for tbl in doc.tables:
        for row in tbl.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def extract_doc(path):
    import olefile
    ole = olefile.OleFileIO(path)
    data = ole.openstream("WordDocument").read()
    # FIB：fcMin/fcMac
    fcMin = int.from_bytes(data[0x18:0x1C], "little")
    fcMac = int.from_bytes(data[0x1C:0x20], "little")
    seg = data[fcMin:fcMac]
    txt = seg.decode("utf-16-le", errors="replace")
    txt = re.sub(r"[\ue000-\uf8ff]", "", txt)
    txt = txt.replace("\r\n", "\n").replace("\r", "\n")
    return txt


def extract_pdf(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfReader
        except ImportError as e:
            raise RuntimeError("PDF 提取依赖未安装，请在部署构建步骤运行：python -m pip install -r requirements.txt") from e
    reader = PdfReader(path)
    parts = []
    for page in reader.pages:
        t = page.extract_text() or ""
        parts.append(t.strip())
    return "\n".join(parts)


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: extract.py <file>\n")
        sys.exit(1)
    path = sys.argv[1]
    ext = os.path.splitext(path)[1].lower()
    try:
        # 上传文件使用无扩展名的随机名称，按文件内容识别格式。
        if not ext:
            with open(path, "rb") as source:
                header = source.read(1024)
            if b"%PDF-" in header:
                ext = ".pdf"
            elif header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
                ext = ".doc"
            elif zipfile.is_zipfile(path):
                with zipfile.ZipFile(path) as archive:
                    if "word/document.xml" in archive.namelist():
                        ext = ".docx"
        if ext == ".docx":
            text = extract_docx(path)
        elif ext == ".doc":
            text = extract_doc(path)
        elif ext == ".pdf":
            text = extract_pdf(path)
        else:
            sys.stderr.write(f"unsupported extension: {ext}\n")
            sys.exit(1)
    except Exception as e:
        sys.stderr.write(f"extract failed: {e}\n")
        sys.exit(1)
    if not text.strip():
        sys.stderr.write("empty text (可能是无文本层的扫描件或 CAD 文件)\n")
        sys.exit(1)
    sys.stdout.buffer.write(text.encode("utf-8"))


if __name__ == "__main__":
    main()
