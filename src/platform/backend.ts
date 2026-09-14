export interface BackendCapabilities {
  directoryInput: boolean;
  directDirectoryOutput: boolean;
  persistentFileHandles: boolean;
  backgroundProcessing: boolean;
  maxRecommendedConcurrency: number;
}

export const desktopCapabilities: BackendCapabilities = {
  directoryInput: true,
  directDirectoryOutput: true,
  persistentFileHandles: true,
  backgroundProcessing: true,
  maxRecommendedConcurrency: 6,
};

export const webCapabilities: BackendCapabilities = {
  directoryInput: true,
  directDirectoryOutput: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  persistentFileHandles: false,
  backgroundProcessing: false,
  maxRecommendedConcurrency: Math.max(
    1,
    Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)),
  ),
};
