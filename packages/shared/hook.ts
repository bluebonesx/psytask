import van from 'vanjs-core';

export function useHash() {
  const hash = van.state(location.hash.slice(1));
  van.derive(() => (location.hash = hash.val ? `#${hash.val}` : ''));
  window.addEventListener(
    'hashchange',
    () => (hash.val = location.hash.slice(1)),
  );
  return hash;
}
export function usePromise<T>(promise: Promise<T> | (() => Promise<T>)) {
  const data = van.state<
    | { status: 'pending' }
    | { status: 'rejected'; reason: any }
    | { status: 'fulfilled'; result: T }
  >({ status: 'pending' });
  van.derive(() => {
    data.val = { status: 'pending' };
    (typeof promise === 'function' ? promise() : promise).then(
      (result) => (data.val = { status: 'fulfilled', result }),
      (reason) => (data.val = { status: 'rejected', reason }),
    );
  });
  return data;
}
