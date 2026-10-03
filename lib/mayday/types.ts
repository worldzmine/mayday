export type TestCase = { name: string; args: unknown[]; expected: unknown };
export type TestResult = { name: string; passed: boolean; actual?: unknown; expected: unknown; error?: string };
export type Verification = { passed: boolean; passedCount: number; total: number; results: TestResult[] };
export type Challenge = { id: string; title: string; filename: string; goal: string; code: string; error: string; tests: TestCase[]; continuation: unknown[]; demoPatches?: string[]; demoNotes?: string[] };
export type RescueWorker = { id: string; agentId?:string; name: string; role: string; color: string; status: string; code?: string; explanation?: string; report?: Verification; elapsedMs?: number; model?: string; error?: string };
export type RescueEvent = { id: string; at: number; actor: string; kind: string; message: string };
export type Rescue = { id: string; title: string; challengeId: string; status: 'racing' | 'resumed' | 'failed'; mode: 'demo' | 'live' | 'network'; createdAt: number; completedAt?: number; challenge: Challenge; original: Verification; workers: RescueWorker[]; events: RescueEvent[]; winnerId?: string; patch?: string; result?: unknown; receipt?: string; error?: string };
export type RescueSummary = Pick<Rescue, 'id' | 'title' | 'status' | 'mode' | 'createdAt' | 'completedAt' | 'winnerId'> & { testsPassed: number; testsTotal: number };
export type LiveConfig = { provider: 'openrouter' | 'anthropic'; apiKey?: string; models?: string[] };
export const WORKERS = [
  { id: 'patch', name: 'PATCH', role: 'The minimal fixer', color: 'yellow', instruction: 'Make the smallest correct fix. Keep the function simple.' },
  { id: 'trace', name: 'TRACE', role: 'The root cause hunter', color: 'blue', instruction: 'Identify the actual root cause and repair every behavior in the goal.' },
  { id: 'forge', name: 'FORGE', role: 'The edge case specialist', color: 'purple', instruction: 'Focus on edge cases, numeric accuracy, invalid data, and complete correctness.' }
] as const;
