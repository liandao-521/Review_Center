import { useEffect, useState } from 'react';

const SYMBOLS = {
  数学: [
    { label: 'x', source: 'x' }, { label: 'y', source: 'y' },
    { label: '平方', source: '^2' }, { label: '立方', source: '^3' },
    { label: '∠ 角', source: '\\angle ' }, { label: '△ 三角形', source: '\\triangle ' },
    { label: '⊥ 垂直', source: '\\perp ' }, { label: '∥ 平行', source: '\\parallel ' },
    { label: '≅ 全等', source: '\\cong ' }, { label: '∼ 相似', source: '\\sim ' },
    { label: '≤', source: '\\le ' }, { label: '≥', source: '\\ge ' }, { label: '≠', source: '\\neq ' },
    { label: '±', source: '\\pm ' }, { label: '×', source: '\\times ' }, { label: '÷', source: '\\div ' },
    { label: '√ 根式', source: '\\sqrt{}', cursor: 'first-brace' }, { label: '∛ 立方根', source: '\\sqrt[3]{}', cursor: 'first-brace' }, { label: '循环小数点', source: '\\dot{}', cursor: 'first-brace' }, { label: '分数线', source: '\\frac{}{}', cursor: 'first-brace' },
    { label: 'π', source: '\\pi' }, { label: 'Δ', source: '\\Delta ' }, { label: '°', source: '^\\circ' },
  ],
  物理: [
    { label: 'F⃗ 力矢量', source: '\\vec{F}', cursor: 'first-brace' }, { label: 'v⃗ 速度矢量', source: '\\vec{v}', cursor: 'first-brace' },
    { label: 'Δ 变化量', source: '\\Delta ' }, { label: 'v=s/t', source: 'v=\\frac{s}{t}', cursor: 'first-brace' },
    { label: 'F=ma', source: 'F=ma' }, { label: 'W=Fs', source: 'W=Fs' }, { label: 'P=W/t', source: 'P=\\frac{W}{t}', cursor: 'first-brace' },
    { label: 'ρ 密度', source: '\\rho ' }, { label: 'I 电流', source: 'I' }, { label: 'U 电压', source: 'U' },
    { label: 'Ω 电阻', source: '\\Omega ' }, { label: 'm/s', source: '\\mathrm{m/s}' },
    { label: 'm/s²', source: '\\mathrm{m/s^2}' }, { label: 'N 牛顿', source: '\\mathrm{N}' },
    { label: 'J 焦耳', source: '\\mathrm{J}' }, { label: 'W 瓦特', source: '\\mathrm{W}' },
  ],
  化学: [
    { label: 'H₂O', source: 'H_2O' }, { label: 'CO₂', source: 'CO_2' }, { label: 'O₂', source: 'O_2' },
    { label: 'Na⁺', source: 'Na^+' }, { label: 'Cl⁻', source: 'Cl^-' }, { label: 'SO₄²⁻', source: 'SO_4^{2-}' },
    { label: '→', source: '\\rightarrow ' }, { label: '⇌', source: '\\rightleftharpoons ' },
    { label: '↑ 气体', source: '\\uparrow ' }, { label: '↓ 沉淀', source: '\\downarrow ' },
    { label: '(s) 固体', source: '\\mathrm{(s)}' }, { label: '(l) 液体', source: '\\mathrm{(l)}' },
    { label: '(g) 气体', source: '\\mathrm{(g)}' }, { label: '(aq) 溶液', source: '\\mathrm{(aq)}' },
  ],
} as const;

export type SymbolCategory = keyof typeof SYMBOLS;
export type SymbolCursor = 'first-brace';

export function SymbolToolbar({ onInsert, subject }: { onInsert: (source: string, cursor?: SymbolCursor) => void; subject?: string }) {
  const initialCategory: SymbolCategory = subject && subject in SYMBOLS ? subject as SymbolCategory : '数学';
  const [category, setCategory] = useState<SymbolCategory>(initialCategory);
  useEffect(() => { if (subject && subject in SYMBOLS) setCategory(subject as SymbolCategory); }, [subject]);
  return <div className="symbol-toolbar" aria-label="常用科学符号">
    <div className="symbol-toolbar-tabs">{(Object.keys(SYMBOLS) as SymbolCategory[]).map((item) => <button key={item} type="button" className={category === item ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="symbol-toolbar-items">{SYMBOLS[category].map((item) => <button key={item.label} type="button" title={`插入 ${item.source}`} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(item.source, 'cursor' in item ? item.cursor : undefined)}>{item.label}</button>)}</div>
    <small>点击插入；自动补齐公式标记</small>
  </div>;
}

export function insertSymbolAtCursor(
  textarea: HTMLTextAreaElement | null,
  value: string,
  setter: (value: string) => void,
  source: string,
  cursor?: SymbolCursor,
) {
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? start;
  const before = value.slice(0, start);
  const inMath = ((before.match(/(?<!\\)\$/g) ?? []).length % 2) === 1;
  const inserted = inMath ? source : `$${source}$`;
  const next = `${before}${inserted}${value.slice(end)}`;
  const cursorInSource = cursor === 'first-brace' ? Math.max(0, source.indexOf('{') + 1) : source.length;
  const caret = start + (inMath ? 0 : 1) + cursorInSource;
  setter(next);
  requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(caret, caret); });
}
