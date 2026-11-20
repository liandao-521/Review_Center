import { useState } from 'react';
import { ChevronDown, Tag } from 'lucide-react';
import { Markdown } from './Markdown';
import { InlineImage, unreferencedImageIndexes } from '../image-reference';

export function ImportQuestionPreview({ subject, questionType, content, answer, explanation, tags, images }: {
  subject: string; questionType: string; content: string; answer: string; explanation: string; tags: string; images: InlineImage[];
}) {
  const [answerVisible, setAnswerVisible] = useState(false);
  const overflowImages = unreferencedImageIndexes(content, images.length);
  return <article className="import-question-preview">
    <div className="question-badges"><span className="subject-badge">{subject}</span>{questionType && <span className="grade-badge">{questionType}</span>}</div>
    <div className="question-content"><Markdown images={images}>{content || '题干内容会显示在这里。'}</Markdown></div>
    {overflowImages.length > 0 && <div className="question-figures">{overflowImages.map((index) => <img key={index} src={images[index - 1].src} alt={images[index - 1].alt || `题图 ${index}`} style={{ transform: `rotate(${images[index - 1].rotation ?? 0}deg) scale(${images[index - 1].displayScale ?? 1})` }} />)}</div>}
    {tags.trim() && <div className="tag-list import-preview-tags">{tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).map((tag, index) => <span className="tag-chip" key={`${tag}-${index}`}><Tag size={12} />{tag}</span>)}</div>}
    <div className="answer-area"><button className="answer-toggle" onClick={() => setAnswerVisible((visible) => !visible)}><span>{answerVisible ? '收起答案' : '显示答案（默认隐藏）'}</span><ChevronDown size={16} className={answerVisible ? 'rotate-chevron' : ''} /></button>
      {answerVisible && <div className="revealed-answer"><div className="answer-block"><span className="answer-label">答案</span><Markdown images={images}>{answer || '暂未填写'}</Markdown></div>{explanation && <div className="answer-block explanation-block"><span className="answer-label">解析</span><Markdown images={images}>{explanation}</Markdown></div>}</div>}
    </div>
  </article>;
}
