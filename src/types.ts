export interface SourceFile {
  id: number;
  source: string;
  relative: string;
  size: number;
}
export interface ScanResult {
  files: SourceFile[];
  roots: string[];
  directoryRoots: string[];
  warnings: string[];
  warningCount: number;
  totalBytes: number;
  mode: ConversionMode;
  incompatibleCount?: number;
}
export interface ToolInfo {
  directory: string;
  encoderVersion: string;
  decoderVersion: string;
}
export type Performance = 'quiet' | 'balanced' | 'maximum';
export type ConversionMode = 'jpegToJxl' | 'jxlToJpeg';
export interface Options {
  mode: ConversionMode;
  outputDir: string;
  effort: number;
  performance: Performance;
  preserveMetadata: boolean;
  skipLarger: boolean;
}
export type ItemStatus = 'converted' | 'existing' | 'notSmaller' | 'failed' | 'cancelled';
export type Stage = 'encoding' | 'decoding' | 'verifying';
export interface ItemResult {
  id: number;
  source: string;
  output: string;
  status: ItemStatus;
  inputBytes: number;
  outputBytes: number | null;
  sha256: string | null;
  elapsedMs: number;
  message: string | null;
}
export type Progress =
  { type: 'stage'; id: number; stage: Stage } | { type: 'item'; result: ItemResult };
export interface Summary {
  total: number;
  converted: number;
  existing: number;
  notSmaller: number;
  failed: number;
  cancelled: number;
  notStarted: number;
  inputBytes: number;
  outputBytes: number;
  elapsedMs: number;
  wasCancelled: boolean;
}
export interface RowState {
  status: Stage | ItemStatus;
  result?: ItemResult;
}
export interface Metrics {
  processed: number;
  converted: number;
  failed: number;
  skipped: number;
  inputBytes: number;
  outputBytes: number;
}
