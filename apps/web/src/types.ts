export type QuestionImage = {
  id: string;
  fileName: string;
  originalName: string;
  rotation: number;
  displayScale: number;
  position: number;
};

export type Attempt = { id: string; isCorrect: boolean; note: string; createdAt: string };
export type Question = {
  id: string;
  subject: string;
  questionType?: string | null;
  grade?: string | null;
  content: string;
  answer: string;
  explanation: string;
  paperId: string;
  pageNumber?: number | null;
  majorNumber?: number | null;
  minorNumber?: number | null;
  sourceTitle?: string | null;
  tags: string[];
  images: QuestionImage[];
  attempts: Attempt[];
  wrongCount: number;
  masteryScore?: number | null;
  masteryUpdatedAt?: string | null;
  inWrongSet?: boolean;
  paper?: { id: string; title: string; subject?: string; grade?: string | null; scope?: 'PERSONAL' | 'CLASSROOM' };
  updatedAt: string;
  canManage?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canAssign?: boolean;
  editorNames?: string[];
};

export type Paper = { id: string; title: string; subject: string; grade?: string | null; scope?: 'PERSONAL' | 'CLASSROOM'; originalName?: string | null; fileName?: string | null; createdAt: string; questionCount?: number; canManage?: boolean };
