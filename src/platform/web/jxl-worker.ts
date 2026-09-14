/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from './protocol';

type CodecModule = {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _jexfold_encode_jpeg(pointer: number, size: number, effort: number): number;
  _jexfold_reconstruct_jpeg(pointer: number, size: number): number;
  _jexfold_result_data(): number;
  _jexfold_result_size(): number;
  _jexfold_result_error(): number;
};

type CodecFactory = (options: { locateFile: (name: string) => string }) => CodecModule;
type CodecImport = { default: CodecFactory };

let codec: Promise<CodecModule> | null = null;

async function loadCodec(codecUrl: string) {
  if (!codec) {
    codec = import(/* @vite-ignore */ codecUrl).then((module) => {
      const factory = (module as unknown as CodecImport).default;
      return factory({ locateFile: (name: string) => new URL(name, codecUrl).href });
    });
  }
  return codec;
}

function invoke(module: CodecModule, input: Uint8Array, operation: (pointer: number) => number) {
  const pointer = module._malloc(input.byteLength);
  if (!pointer) throw new Error('Not enough memory for this file.');
  try {
    module.HEAPU8.set(input, pointer);
    if (operation(pointer) !== 0)
      throw new Error(`JPEG XL codec error ${module._jexfold_result_error()}.`);
    const output = module.HEAPU8.slice(
      module._jexfold_result_data(),
      module._jexfold_result_data() + module._jexfold_result_size(),
    );
    return output;
  } finally {
    module._free(pointer);
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1)
    if (left[index] !== right[index]) return false;
  return true;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const module = await loadCodec(request.codecUrl);
    const input = new Uint8Array(request.bytes);
    let output: Uint8Array;
    if (request.mode === 'jpegToJxl') {
      self.postMessage({
        type: 'stage',
        id: request.id,
        stage: 'encoding',
      } satisfies WorkerResponse);
      output = invoke(module, input, (pointer) =>
        module._jexfold_encode_jpeg(pointer, input.byteLength, request.effort),
      );
      self.postMessage({
        type: 'stage',
        id: request.id,
        stage: 'verifying',
      } satisfies WorkerResponse);
      const reconstructed = invoke(module, output, (pointer) =>
        module._jexfold_reconstruct_jpeg(pointer, output.byteLength),
      );
      if (!equalBytes(input, reconstructed))
        throw new Error('The reconstructed JPEG differs from the source.');
    } else {
      self.postMessage({
        type: 'stage',
        id: request.id,
        stage: 'decoding',
      } satisfies WorkerResponse);
      output = invoke(module, input, (pointer) =>
        module._jexfold_reconstruct_jpeg(pointer, input.byteLength),
      );
    }
    const bytes = output.buffer as ArrayBuffer;
    // Keep the transfer list on the same line: the project smoke test checks
    // that the worker still uses a transferable postMessage payload.
    // prettier-ignore
    self.postMessage({ type: 'complete', id: request.id, bytes } satisfies WorkerResponse, [bytes]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
  }
};
