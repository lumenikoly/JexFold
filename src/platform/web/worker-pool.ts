import type { ConversionMode, Stage } from '../../types';
import type { WorkerRequest, WorkerResponse } from './protocol';

type Waiting = { resolve: (slot: WorkerSlot) => void; reject: (error: Error) => void };
type WorkerSlot = { worker: Worker; busy: boolean; reject?: (error: Error) => void };

export class WorkerPool {
  private slots: WorkerSlot[];
  private waiting: Waiting[] = [];
  private cancelled = false;

  constructor(
    size: number,
    private readonly codecUrl: string,
  ) {
    this.slots = Array.from({ length: size }, () => this.createSlot());
  }

  private createSlot(): WorkerSlot {
    return {
      worker: new Worker(new URL('./jxl-worker.ts', import.meta.url), { type: 'module' }),
      busy: false,
    };
  }

  private acquire(): Promise<WorkerSlot> {
    const slot = this.slots.find((candidate) => !candidate.busy);
    if (slot) {
      slot.busy = true;
      return Promise.resolve(slot);
    }
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }

  private release(slot: WorkerSlot) {
    const next = this.waiting.shift();
    if (next && !this.cancelled) next.resolve(slot);
    else slot.busy = false;
  }

  async convert(
    id: number,
    file: File,
    mode: ConversionMode,
    effort: number,
    onStage: (stage: Stage) => void,
  ) {
    if (this.cancelled) throw new DOMException('Cancelled', 'AbortError');
    const slot = await this.acquire();
    if (this.cancelled) {
      this.release(slot);
      throw new DOMException('Cancelled', 'AbortError');
    }
    const bytes = await file.arrayBuffer();
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const finish = () => {
        slot.worker.onmessage = null;
        slot.worker.onerror = null;
        slot.reject = undefined;
        this.release(slot);
      };
      slot.reject = reject;
      slot.worker.onerror = (event) => {
        finish();
        reject(new Error(event.message || 'The worker stopped unexpectedly.'));
      };
      slot.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        if (response.id !== id) return;
        if (response.type === 'stage') onStage(response.stage);
        else if (response.type === 'complete') {
          finish();
          resolve(response.bytes);
        } else {
          finish();
          reject(new Error(response.error));
        }
      };
      const request: WorkerRequest = {
        type: 'convert',
        id,
        mode,
        bytes,
        effort,
        codecUrl: this.codecUrl,
      };
      slot.worker.postMessage(request, [bytes]);
    });
  }

  cancel() {
    this.cancelled = true;
    const error = new DOMException('Cancelled', 'AbortError');
    this.waiting.splice(0).forEach((waiter) => waiter.reject(error));
    this.slots.forEach((slot) => {
      slot.reject?.(error);
      slot.reject = undefined;
      slot.worker.terminate();
    });
  }

  close() {
    this.slots.forEach((slot) => slot.worker.terminate());
    this.waiting = [];
  }
}
