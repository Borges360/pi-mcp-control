/**
 * Locate pi's own extension loader without assuming pi is a dependency of this repo.
 * Using pi's real loader means imports resolve exactly as they do at runtime
 * (jiti plus the host-provided module mapping), which a fake-`pi` unit test cannot show.
 */
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function piExtensions(explicitEntry) {
  const candidates = [explicitEntry, process.env.PI_CODING_AGENT_ENTRY, ...(await releaseEntries())].filter(
    Boolean,
  );
  for (const path of candidates) {
    const dir = String(path).replace(/[\\/]index\.js$/, '');
    for (const sub of ['core/extensions/index.js', 'index.js']) {
      try {
        const mod = await import(pathToFileURL(join(dir, ...sub.split('/'))).href);
        if (
          typeof mod.loadExtensions === 'function' &&
          typeof mod.createExtensionRuntime === 'function'
        )
          return mod;
      } catch {
        /* next candidate */
      }
    }
  }
  throw Error(
    'Could not locate the installed pi extension loader. Set PI_CODING_AGENT_ENTRY to <pi>/dist.',
  );
}

async function releaseEntries() {
  const root = join(homedir(), '.pi', 'agent', 'install', 'releases');
  let versions = [];
  try {
    versions = (await readdir(root)).sort().reverse();
  } catch {
    return [];
  }
  return versions.map((v) =>
    join(root, v, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'index.js'),
  );
}
