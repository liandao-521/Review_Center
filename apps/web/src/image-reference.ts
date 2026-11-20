export type InlineImage = { src: string; alt?: string; rotation?: number; displayScale?: number };

export function imageReference(index: number) {
  return `![题图${index}](/__question-image-${index}__)`;
}

export function insertImageReferenceAtCursor(
  textarea: HTMLTextAreaElement | null,
  content: string,
  index: number,
  update: (content: string) => void,
) {
  const start = textarea?.selectionStart ?? content.length;
  const end = textarea?.selectionEnd ?? start;
  const before = content.slice(0, start);
  const after = content.slice(end);
  const prefix = before && !before.endsWith('\n') ? '\n' : '';
  const suffix = after && !after.startsWith('\n') ? '\n' : '';
  const reference = `${prefix}${imageReference(index)}${suffix}`;
  update(`${before}${reference}${after}`);
  const caret = before.length + reference.length;
  requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(caret, caret); });
}

export function unreferencedImageIndexes(content: string, imageCount: number) {
  const referenced = new Set<number>();
  for (const match of content.matchAll(/\]\(\/__question-image-(\d+)__\)/g)) referenced.add(Number(match[1]));
  return Array.from({ length: imageCount }, (_, index) => index + 1).filter((index) => !referenced.has(index));
}

export function removeImageReferences(content: string, removedIndex: number) {
  return content
    .replace(/!\[([^\]]*)\]\(\/__question-image-(\d+)__\)/g, (token, _alt: string, value: string) => {
      const index = Number(value);
      if (index === removedIndex) return '';
      return index > removedIndex ? token.replace(`__question-image-${index}__`, `__question-image-${index - 1}__`) : token;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}
