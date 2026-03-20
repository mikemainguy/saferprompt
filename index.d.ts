export interface DetectionResult {
  label: "SAFE" | "INJECTION";
  score: number;
  isInjection: boolean;
}

export interface DetectorOptions {
  localOnly?: boolean;
}

export function createDetector(
  options?: DetectorOptions,
): Promise<(text: string) => Promise<DetectionResult>>;

export function detectInjection(text: string): Promise<DetectionResult>;
