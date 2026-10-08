import type { z } from 'zod';
import type {
  AnswerTypeSchema,
  ArtifactKindSchema,
  CorrectAnswerSchema,
  DatasetFileSchema,
  DatasetManifestSchema,
  FigureSpecSchema,
  GradingCriteriaSchema,
  PracticeEvidenceSchema,
  ScoreSchema,
  TaskInstanceSchema,
  TaskNumberSchema,
  VariantSchema,
} from './schemas';

// Schemas are the single source of truth for serialisable boundary data.
export type TaskNumber = z.infer<typeof TaskNumberSchema>;
export type Score = z.infer<typeof ScoreSchema>;
export type AnswerType = z.infer<typeof AnswerTypeSchema>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type CorrectAnswer = z.infer<typeof CorrectAnswerSchema>;
export type GradingCriteria = z.infer<typeof GradingCriteriaSchema>;
export type TaskInstance = z.infer<typeof TaskInstanceSchema>;
export type FigureSpec = z.infer<typeof FigureSpecSchema>;
export type DatasetFile = z.infer<typeof DatasetFileSchema>;
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;
export type PracticeEvidence = z.infer<typeof PracticeEvidenceSchema>;
export type Variant = z.infer<typeof VariantSchema>;

export interface Generator {
  id: string;
  taskNumber: TaskNumber;
  subtype: string;
  title: string;
  generate(seed: string): TaskInstance;
  verify(task: TaskInstance): boolean;
}
