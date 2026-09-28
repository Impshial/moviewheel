export class TaskQueue {
  private running = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly concurrency = 2) {}
  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.waiting.shift()?.();
          });
      };
      if (this.running < this.concurrency) start();
      else this.waiting.push(start);
    });
  }
}
