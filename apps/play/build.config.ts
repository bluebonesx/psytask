import { cp } from 'fs/promises';

await cp('examples', 'dist', { recursive: true });
export default {};
