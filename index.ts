import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import install from './extension.mjs';
export default function (pi: ExtensionAPI) {
  install(pi);
}
