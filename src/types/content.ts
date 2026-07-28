export interface IContent {
  identifier: string;
  name: string;
  description?: string;
  mimeType?: string;
  contentType?: string;
  primaryCategory?: string;
  questionType?: string;
  appIcon?: string;
  channel?: string;
  organisation?: string[];
  framework?: string;
  status?: string;
  visibility?: string;
  pkgVersion?: number;
  subject?: string[];
  gradeLevel?: string[];
}

export interface ILibraryItem extends IContent {
  isSelected?: boolean;
  isDragging?: boolean;
}

// Matches the registry's question-type primaryCategory values exactly
// (src/registry/defaultQuestionTypes.ts) — 'all' plus one chip per type.
export const QUESTION_FILTERS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'All', value: 'all' },
  { label: 'Multiple Choice', value: 'Multiple Choice Question' },
  { label: 'Fill in the Blank', value: 'FTB Question' },
  { label: 'Subjective', value: 'Subjective Question' },
  { label: 'Match', value: 'Match The Following Question' },
  { label: 'Sequence', value: 'Sequence Question' },
  { label: 'Reorder', value: 'Reorder Question' },
  { label: 'True/False', value: 'Boolean Question' },
];
