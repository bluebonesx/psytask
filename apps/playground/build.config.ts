await Bun.$`cp -r examples dist`;
export default {
  params: {
    importmap: {
      '@stackblitz/sdk':
        'https://cdn.jsdelivr.net/npm/@stackblitz/sdk@1/bundles/sdk.m.js',
    },
  },
};
