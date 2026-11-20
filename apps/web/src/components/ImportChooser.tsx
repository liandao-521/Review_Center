import { Archive, ArrowLeft, FileText, ImagePlus, ScanText } from 'lucide-react';

export type ImportMode = 'pdf' | 'image' | 'word' | 'package';
export function ImportChooser({ onBack, onSelect, scope, canImportShared }: { onBack: () => void; onSelect: (mode: ImportMode) => void; scope: 'PERSONAL' | 'CLASSROOM'; canImportShared: boolean }) {
  return <main className="import-page import-chooser-page">
    <header className="page-topbar"><button className="back-button" onClick={onBack}><ArrowLeft size={18} />返回题库</button><div><span className="eyebrow">QUESTION IMPORT</span><h1>选择导入文件</h1></div></header>
    <section className="import-chooser-content"><div className="import-intro"><span className="eyebrow">PAPER TO QUESTIONS</span><h2>从已有材料拆出题目</h2><p>新建来源会保存为{scope === 'PERSONAL' ? '个人试卷' : '班级共享试卷'}，也可以选择当前题库中的已有试卷。</p></div><div className="import-choice-grid">
      <button className="import-choice-card" onClick={() => onSelect('pdf')}><span className="import-choice-icon pdf-choice"><FileText size={22} /></span><strong>PDF 试卷</strong><span>框选文字并提取，单独裁剪题图</span></button>
      <button className="import-choice-card" onClick={() => onSelect('image')}><span className="import-choice-icon image-choice"><ImagePlus size={22} /></span><strong>整页图片</strong><span>扫描件或拍照，框选后 OCR 识别</span></button>
      <button className="import-choice-card" onClick={() => onSelect('word')}><span className="import-choice-icon word-choice"><ScanText size={22} /></span><strong>Word 文档</strong><span>预览 DOCX，手动选取文字和插图</span></button>
      {canImportShared && <button className="import-choice-card" onClick={() => onSelect('package')}><span className="import-choice-icon package-choice"><Archive size={22} /></span><strong>导入共享整卷</strong><span>导入学生交来的个人试卷包，整卷成为班级共享试卷</span></button>}
    </div><p className="import-chooser-note">整卷包包含试卷信息、题目和题图，不包含原始试卷文件或学生练习记录。图片 OCR 首次使用会下载简体中文和英文识别数据。</p></section>
  </main>;
}
