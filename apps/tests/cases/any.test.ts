import van from 'vanjs-core';

const { div } = van.tags;

export const VanJS = {
  async test() {
    const s = van.state(1);
    const el = div({
      style: () => (
        performance.mark('style update: ' + s.val),
        `height: ${s.val}px`
      ),
    });

    const effect = () =>
      performance.mark(`effect: ${s.val} ${el.style.height}`);
    van.derive(effect);
    queueMicrotask(() =>
      performance.mark(`microtask: ${s.val} ${el.style.height}`),
    );

    van.add(document.body, el);
    s.val = 2;
  },
};
