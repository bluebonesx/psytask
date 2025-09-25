declare global {
  const psytask: typeof import('psytask');
}
export default {
  css: [],
  js: [`/public/psytask/index.global.min.js?t=${Date.now()}`],
};
