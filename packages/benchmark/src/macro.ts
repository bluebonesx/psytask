import fs from 'node:fs/promises';

export async function getLibs() {
  return (await fs.readdir('src', { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
export async function getTasks() {
  return (await fs.readdir('src/psytask', { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith('.bench.ts'))
    .map((e) => e.name.replace('.bench.ts', ''))
    .sort();
}
