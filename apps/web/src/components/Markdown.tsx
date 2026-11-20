import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { InlineImage } from '../image-reference';

export function Markdown({ children, className = '', images = [], onImageError }: { children: string; className?: string; images?: InlineImage[]; onImageError?: () => void }) {
  if (!children?.trim()) return <div className={`markdown empty-markdown ${className}`}>暂未填写</div>;
  return <div className={`markdown ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{
      img: ({ src, alt }) => {
        const match = /^\/__question-image-(\d+)__$/.exec(src ?? '');
        if (!match) return <img src={src} alt={alt ?? ''} onError={onImageError} />;
        const image = images[Number(match[1]) - 1];
        if (!image) return <span className="missing-inline-image">题图 {match[1]} 尚未添加</span>;
        return <img src={image.src} alt={alt || `题图 ${match[1]}`} onError={onImageError} style={{ transform: `rotate(${image.rotation ?? 0}deg) scale(${image.displayScale ?? 1})` }} />;
      },
    }}>{children}</ReactMarkdown>
  </div>;
}
