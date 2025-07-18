import { $ } from 'bun';
import { port, showAllInterfaces } from 'shared/script';

showAllInterfaces();
await $`FORCE_COLOR=1 bun index.html --hostname=0.0.0.0 --port=${port}`;
