import { expect } from 'chai';
import { createApp, generic } from 'psytask';
import { Loader } from '@psytask/components';
import van from 'vanjs-core';

const { div } = van.tags;

const app = await createApp();
const loader = app.scene(generic(Loader), {
  defaultProps: () => ({ urls: [] }),
});

export const _Loader = {
  async 'load normally'() {
    const { blobs } = await loader.show({
      urls: Array.from(
        { length: 6 },
        (_, i) => `https://httpbin.org/status/200?${i}`,
      ),
    });

    expect(blobs).to.have.lengthOf(6);
  },
  async 'load with progress'() {
    const { blobs } = await loader.show({
      urls: [
        'https://httpbin.org/bytes/102400',
        'https://httpbin.org/bytes/51200',
      ],
    });

    expect(blobs).to.have.lengthOf(2);
    console.log(blobs);
    expect(blobs[0].size).to.equal(102400);
    expect(blobs[1].size).to.equal(51200);
  },
  async 'load with error'() {
    try {
      const { blobs } = await loader.show({
        urls: [
          'https://httpbin.org/bytes/1024',
          'https://httpbin.org/status/404',
          'https://httpbin.org/bytes/2048',
        ],
      });
      expect.fail('Should have thrown an error, got blobs: ' + blobs);
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.include('404');
    }
  },
};
