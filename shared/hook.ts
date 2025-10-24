import van from 'vanjs-core';

export const useHash = (defaultValue = '') => {
  const hash = van.state(location.hash.slice(1));
  van.derive(() => (location.hash = hash.val ? `#${hash.val}` : ''));
  window.addEventListener(
    'hashchange',
    () => (hash.val = location.hash.slice(1)),
  );
  hash.val ||= defaultValue;
  return hash;
};
