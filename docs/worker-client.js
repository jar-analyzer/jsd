export class WorkerClient {
  active = null;

  cancel() {
    this.active?.(new DOMException('Cancelled', 'AbortError'));
  }

  run(action, payload) {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      let timer;
      const finish = (error, result) => {
        clearTimeout(timer);
        worker.terminate();
        if (this.active === finish) this.active = null;
        error ? reject(error) : resolve(result);
      };
      this.active = finish;
      if (action !== 'load') timer = setTimeout(() => finish(new Error('TIMEOUT')), 30000);
      worker.onmessage = ({ data }) =>
        finish(data.error ? new Error(data.error) : null, data.result);
      worker.onerror = () => finish(new Error('WORKER_FAILED'));
      worker.postMessage({ action, ...payload });
    });
  }
}
