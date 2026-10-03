import type { QuickJSWASMModule, QuickJSHandle } from 'quickjs-emscripten';
import type { TestCase, Verification, TestResult } from './types.ts';
export function deepEqual(a: unknown, b: unknown): boolean {
 if (a === b) return true;
 if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
 if (Array.isArray(a) !== Array.isArray(b)) return false;
 const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
 return ak.length === bk.length && ak.every((k, i) => k === bk[i] && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const serializerSource = `(() => {
 const stringify = JSON.stringify, keys = Object.keys, isArray = Array.isArray, finite = Number.isFinite;
 return function serialize(value) {
  const seen = new Set();
  function check(v, depth) {
   if (depth > 64) throw new Error('Output is too deeply nested');
   if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
   if (typeof v === 'number' && finite(v)) return;
   if (typeof v !== 'object') throw new Error('Output must be JSON, not undefined or a function');
   if (typeof v.then === 'function') throw new Error('Async functions are not supported');
   if (seen.has(v)) throw new Error('Output contains a cycle');
   seen.add(v); const names = keys(v);
   if (names.length > 10000) throw new Error('Output is too large');
   for (let i = 0; i < names.length; i++) check(v[names[i]], depth + 1);
   seen.delete(v);
  }
  check(value, 0); const output = stringify(value);
  if (!output || output.length > 32768) throw new Error('Output exceeds 32 KB');
  return output;
 };
})()`;
export function runCase(module: QuickJSWASMModule, source: string, test: TestCase): TestResult {
 const runtime = module.newRuntime();
 runtime.setMemoryLimit(8 * 1024 * 1024); runtime.setMaxStackSize(256 * 1024);
 let count = 0; runtime.setInterruptHandler(() => ++count > 32);
 const vm = runtime.newContext(); const handles: QuickJSHandle[] = [];
 function keep(h: QuickJSHandle) { handles.push(h); return h; }
 function unwrap(r: ReturnType<typeof vm.evalCode>) {
  if (r.error) { const h = r.error; let error = 'Sandbox rejected the code'; try { const d = vm.dump(h); error = typeof d === 'object' && d?.message ? d.message : String(d); } finally { h.dispose(); } throw new Error(error); }
  return keep(r.value);
 }
 try {
  const serializer = unwrap(vm.evalCode(serializerSource));
  const input = unwrap(vm.evalCode(`JSON.parse(${JSON.stringify(JSON.stringify(test.args))})`));
  const args = test.args.map((_, i) => keep(vm.getProp(input, i)));
  const normalized = source.trim().replace(/^export\s+default\s+/, '').replace(/^export\s+/, '').replace(/;\s*$/, '');
  const fn = unwrap(vm.evalCode(`(${normalized}\n)`, 'candidate.js'));
  if (vm.typeof(fn) !== 'function') throw new Error('Submit one synchronous JavaScript function');
  const result = unwrap(vm.callFunction(fn, vm.undefined, ...args));
  const output = unwrap(vm.callFunction(serializer, vm.undefined, result));
  const actual = JSON.parse(vm.getString(output));
  return {name: test.name, passed: deepEqual(actual, test.expected), actual, expected: test.expected};
 } catch (error) { return {name: test.name, passed: false, expected: test.expected, error: error instanceof Error ? error.message.slice(0, 500) : 'Sandbox execution failed'}; }
 finally { for (const h of handles.reverse()) h.dispose(); vm.dispose(); runtime.dispose(); }
}
export function verify(module: QuickJSWASMModule, code: string, tests: TestCase[]): Verification {
 const results = tests.map(test => runCase(module, code, test));
 const passedCount = results.filter(r => r.passed).length;
 return {passed: tests.length > 0 && passedCount === tests.length, passedCount, total: tests.length, results};
}
