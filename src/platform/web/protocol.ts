import type { ConversionMode, Stage } from '../../types';

export type WorkerRequest = {
  type: 'convert';
  id: number;
  mode: ConversionMode;
  bytes: ArrayBuffer;
  effort: number;
  codecUrl: string;
};

export type WorkerResponse =
  | { type: 'stage'; id: number; stage: Stage }
  | { type: 'complete'; id: number; bytes: ArrayBuffer }
  | { type: 'error'; id: number; error: string };
