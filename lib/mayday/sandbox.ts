import { newQuickJSWASMModule, newVariant, RELEASE_SYNC } from 'quickjs-emscripten';
import wasmModule from './quickjs.wasm?module';
const quickJS = newQuickJSWASMModule(newVariant(RELEASE_SYNC, { wasmModule }));
export function getSandbox() { return quickJS; }
