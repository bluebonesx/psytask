import { on } from '@psytask/core';
import { doc } from 'shared/utils';

export const onPageLeave = (fn: () => void) =>
  on(doc, 'visibilitychange', () => doc.hidden && fn());
