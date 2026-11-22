import { SlaWorker } from './sla.worker';

describe('SlaWorker.check', () => {
  const db = { count: jest.fn() };
  const pgBoss = {
    schedule: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
  };

  it('alerts (does not throw) when items are breached and returns counts', async () => {
    db.count
      .mockResolvedValueOnce(3) // flags
      .mockResolvedValueOnce(2); // reports
    const worker = new SlaWorker(db as any, pgBoss as any);
    await expect(worker.check()).resolves.toEqual({ breachedFlags: 3, breachedReports: 2 });
    expect(db.count).toHaveBeenCalledTimes(2);
  });

  it('is silent when nothing is breached', async () => {
    db.count.mockReset().mockResolvedValue(0);
    const worker = new SlaWorker(db as any, pgBoss as any);
    await expect(worker.check()).resolves.toEqual({ breachedFlags: 0, breachedReports: 0 });
  });
});
