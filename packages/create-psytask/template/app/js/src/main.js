import 'psytask/main.css';
import { createApp } from 'psytask';

const app = await createApp();

// cleanup
app[Symbol.dispose]();
