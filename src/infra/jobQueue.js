class MemoryProcessorQueue {
  constructor({ name, handler, concurrency = 1 }) {
    if (!name) throw new Error('queue name is required');
    if (typeof handler !== 'function') throw new Error('queue handler is required');
    this.name = String(name);
    this.handler = handler;
    this.concurrency = Math.max(1, Number(concurrency || 1) || 1);
    this.jobs = [];
    this.activeCount = 0;
    this.closed = false;
    this.timers = new Set();
  }

  async enqueue(payload = {}, options = {}) {
    if (this.closed) throw new Error(`queue ${this.name} is closed`);
    const delayMs = Math.max(0, Number(options.delayMs || 0) || 0);
    const job = {
      id: String(options.jobId || `memjob_${crypto.randomUUID()}`),
      payload: structuredClone(payload || {})
    };

    if (delayMs > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.jobs.push(job);
        void this._drain();
      }, delayMs);
      this.timers.add(timer);
      if (typeof timer.unref === 'function') timer.unref();
    } else {
      this.jobs.push(job);
      void this._drain();
    }

    return { id: job.id, queue: this.name, backend: 'memory' };
  }

  async _drain() {
    if (this.closed) return;
    while (!this.closed && this.activeCount < this.concurrency && this.jobs.length) {
      const job = this.jobs.shift();
      if (!job) continue;
      this.activeCount += 1;
      Promise.resolve()
        .then(() => this.handler(job.payload, { id: job.id, queue: this.name }))
        .catch((err) => {
          console.error(`[job-queue:${this.name}] handler failed`, err);
        })
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1);
          void this._drain();
        });
    }
  }

  async close() {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.jobs = [];
  }
}

class MemoryJobQueueBroker {
  constructor({ prefix = 'rainboard' } = {}) {
    this.backend = 'memory';
    this.prefix = String(prefix || 'rainboard');
    this.queues = [];
    this.meta = { fallbackReason: '' };
  }

  createProcessorQueue(name, options = {}) {
    const queue = new MemoryProcessorQueue({
      name: `${this.prefix}:${String(name || 'default')}`,
      handler: options.handler,
      concurrency: options.concurrency || 1
    });
    this.queues.push(queue);
    return queue;
  }

  async close() {
    await Promise.all(this.queues.map((q) => q.close()));
    this.queues = [];
  }
}

class BullMqProcessorQueue {
  constructor({ name, handler, concurrency = 1, prefix = 'rainboard', connection, bullmq }) {
    if (!name) throw new Error('queue name is required');
    if (typeof handler !== 'function') throw new Error('queue handler is required');
    const { Queue, Worker } = bullmq;
    this.name = String(name);
    this.queueName = `${prefix}:${this.name}`;
    this.queue = new Queue(this.queueName, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 500
      }
    });
    this.worker = new Worker(
      this.queueName,
      async (job) => handler(job.data || {}, { id: String(job.id || ''), queue: this.queueName }),
      {
        connection,
        concurrency: Math.max(1, Number(concurrency || 1) || 1)
      }
    );
    this.worker.on('error', (err) => {
      console.error(`[job-queue:${this.queueName}] worker error`, err);
    });
  }

  async enqueue(payload = {}, options = {}) {
    const delay = Math.max(0, Number(options.delayMs || 0) || 0);
    const job = await this.queue.add('job', structuredClone(payload || {}), {
      jobId: options.jobId ? String(options.jobId) : undefined,
      delay
    });
    return { id: String(job.id || ''), queue: this.queueName, backend: 'bullmq' };
  }

  async close() {
    await this.worker.close();
    await this.queue.close();
  }
}

class BullMqJobQueueBroker {
  constructor({ prefix = 'rainboard', connection, bullmq, redisUrl }) {
    this.backend = 'bullmq';
    this.prefix = String(prefix || 'rainboard');
    this.connection = connection;
    this.bullmq = bullmq;
    this.redisUrl = String(redisUrl || '');
    this.queues = [];
    this.meta = { redisUrlConfigured: Boolean(this.redisUrl) };
  }

  static async create({ prefix = 'rainboard', redisUrl } = {}) {
    const bullmq = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(String(redisUrl || ''), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    });
    await connection.ping();
    return new BullMqJobQueueBroker({ prefix, connection, bullmq, redisUrl });
  }

  createProcessorQueue(name, options = {}) {
    const queue = new BullMqProcessorQueue({
      name,
      handler: options.handler,
      concurrency: options.concurrency || 1,
      prefix: this.prefix,
      connection: this.connection,
      bullmq: this.bullmq
    });
    this.queues.push(queue);
    return queue;
  }

  async close() {
    for (const q of this.queues) await q.close();
    this.queues = [];
    if (this.connection) {
      await this.connection.quit();
      this.connection = null;
    }
  }
}

async function createJobQueueBroker(config = {}) {
  const requested = String(config.queueBackend || 'memory').toLowerCase();
  const prefix = String(config.queuePrefix || 'rainboard');
  const redisUrl = String(config.redisUrl || '');

  if (requested === 'bullmq') {
    if (!redisUrl) {
      const broker = new MemoryJobQueueBroker({ prefix });
      broker.meta.fallbackReason = 'missing_redis_url';
      console.warn('[job-queue] bullmq requested but REDIS_URL is missing, fallback to memory');
      return broker;
    }
    try {
      return await BullMqJobQueueBroker.create({ prefix, redisUrl });
    } catch (err) {
      const broker = new MemoryJobQueueBroker({ prefix });
      broker.meta.fallbackReason = `bullmq_init_failed:${String(err?.message || 'unknown')}`;
      console.warn('[job-queue] bullmq init failed, fallback to memory:', err?.message || err);
      return broker;
    }
  }

  return new MemoryJobQueueBroker({ prefix });
}

module.exports = {
  createJobQueueBroker,
  MemoryJobQueueBroker
};
