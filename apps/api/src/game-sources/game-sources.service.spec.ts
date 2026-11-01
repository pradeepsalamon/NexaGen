import { HttpException, HttpStatus } from '@nestjs/common';
import { resolveAutoSync } from '@nexa-chess/types';
import { GameSourcesService } from './game-sources.service';

describe('resolveAutoSync', () => {
  it.each([
    // The academy's OFF is a master switch, even over a coach's ALWAYS.
    ['OFF', 'ALWAYS', true, false, 'ACADEMY'],
    ['OFF', null, true, false, 'ACADEMY'],
    // A per-student NEVER exempts them, even from REQUIRED.
    ['REQUIRED', 'NEVER', true, false, 'STAFF'],
    ['OPTIONAL', 'NEVER', true, false, 'STAFF'],
    ['REQUIRED', null, false, true, 'ACADEMY'],
    ['REQUIRED', 'ALWAYS', false, true, 'ACADEMY'],
    ['OPTIONAL', 'ALWAYS', false, true, 'STAFF'],
    // Only here does the student decide.
    ['OPTIONAL', null, true, true, null],
    ['OPTIONAL', null, false, false, null],
  ] as const)('%s + %s + choice %s = %s', (policy, rule, studentChoice, enabled, lockedBy) => {
    expect(resolveAutoSync({ policy, rule, studentChoice })).toEqual({ enabled, lockedBy });
  });
});

describe('GameSourcesService.runAutoSync', () => {
  const account = (id: string, provider: string, autoSync: boolean, rule: string | null = null) => ({
    autoSync,
    id,
    provider,
    user: { studentProfile: { gameAutoSyncRule: rule } },
    userId: `user-${id}`,
  });

  function setup(policy: string | null, rows: unknown[], hasFeature = true) {
    const update = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = {
      externalChessAccount: { findMany, update },
      gameSourceSettings: { findUnique: jest.fn().mockResolvedValue(policy ? { autoSyncPolicy: policy } : null) },
    };
    const service = new GameSourcesService(
      {} as never,
      prisma as never,
      {} as never,
      {} as never,
      { hasFeature: jest.fn().mockResolvedValue(hasFeature) } as never,
      {} as never,
    );
    const runSync = jest.fn().mockResolvedValue({ more: false });
    (service as unknown as { runSync: jest.Mock }).runSync = runSync;
    return { findMany, runSync, service, update };
  }
  const signal = new AbortController().signal;

  it('does not read anything while the academy setting is off, the default', async () => {
    const { findMany, service } = setup(null, []);
    await service.runAutoSync(signal);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does not run on a plan without game analysis', async () => {
    const { findMany, service } = setup('REQUIRED', [], false);
    await service.runAutoSync(signal);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('syncs only the accounts the rules turn on, and queues no analysis', async () => {
    const { runSync, service } = setup('OPTIONAL', [
      account('chose-yes', 'LICHESS', true),
      account('chose-no', 'LICHESS', false),
      account('coach-always', 'LICHESS', false, 'ALWAYS'),
      account('coach-never', 'LICHESS', true, 'NEVER'),
    ]);
    await service.runAutoSync(signal);
    expect(runSync.mock.calls.map(([row]) => row.id)).toEqual(['chose-yes', 'coach-always']);
    expect(runSync.mock.calls.every(([, analyseAs]) => analyseAs === null)).toBe(true);
  });

  it('a failure waits a day and does not stop the other accounts', async () => {
    const { runSync, service, update } = setup('REQUIRED', [account('a', 'LICHESS', false), account('b', 'LICHESS', false)]);
    runSync.mockRejectedValueOnce(new HttpException('down', HttpStatus.SERVICE_UNAVAILABLE));
    await service.runAutoSync(signal);
    expect(runSync).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastAutoSyncAt: expect.any(Date) }), where: { id: 'a' } }));
    expect(update).not.toHaveBeenCalledWith({ data: { lastAutoSyncAt: null }, where: { id: 'a' } });
  });

  it('a 429 rests that provider for the pass and keeps the account due', async () => {
    const { runSync, service, update } = setup('REQUIRED', [
      account('a', 'LICHESS', false),
      account('b', 'LICHESS', false),
      account('c', 'CHESS_COM', false),
    ]);
    runSync.mockRejectedValueOnce(new HttpException('slow down', HttpStatus.TOO_MANY_REQUESTS));
    await service.runAutoSync(signal);
    expect(runSync.mock.calls.map(([row]) => row.id)).toEqual(['a', 'c']);
    expect(update).toHaveBeenCalledWith({ data: { lastAutoSyncAt: null }, where: { id: 'a' } });
  });

  it('a backlog stays due so the next pass carries on', async () => {
    const { runSync, service, update } = setup('REQUIRED', [account('a', 'LICHESS', false)]);
    runSync.mockResolvedValueOnce({ more: true });
    await service.runAutoSync(signal);
    expect(update).toHaveBeenLastCalledWith({ data: { lastAutoSyncAt: null }, where: { id: 'a' } });
  });

  it('stops when the job lease is lost', async () => {
    const { runSync, service } = setup('REQUIRED', [account('a', 'LICHESS', false)]);
    const lost = new AbortController();
    lost.abort();
    await service.runAutoSync(lost.signal);
    expect(runSync).not.toHaveBeenCalled();
  });
});
