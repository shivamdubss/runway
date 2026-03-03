import { describe, it, expect, beforeEach } from 'vitest';

// Mock supabase before importing visualization module
import { vi } from 'vitest';
vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } }))
    }
  }
}));

const {
  __resetVisualizationSchedulerForTests,
  __resetVizRegistryForTests,
  getVizEntry,
  setVizEntry,
  updateVizPose,
  hydrateVizEntry,
  remapVizEntryKey,
  pruneVizRegistry,
  subscribeVizRegistry,
  getVizRegistrySnapshot,
  getResolvedVizId,
  makePoseEntry,
  buildQueuedPoseEntries,
  buildReadyPoseEntries,
  deriveVisualizationStatus,
  hasPendingVisualizationPose,
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetVizRegistryForTests();
});

describe('viz registry', () => {
  describe('setVizEntry / getVizEntry', () => {
    it('round-trips an entry', () => {
      const entry = { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://f.png' }), outfit: { id: 'o1' } };
      setVizEntry('o1', entry);
      expect(getVizEntry('o1')).toEqual(entry);
    });

    it('returns null for missing entry', () => {
      expect(getVizEntry('missing')).toBeNull();
    });
  });

  describe('updateVizPose', () => {
    it('updates an existing entry and recomputes status', () => {
      setVizEntry('o1', { status: 'queued', poses: buildQueuedPoseEntries(), outfit: { id: 'o1' } });
      updateVizPose('o1', 'front', makePoseEntry('ready', 'http://f.png'));

      const entry = getVizEntry('o1');
      expect(entry.poses.front.status).toBe('ready');
      expect(entry.poses.front.imageUrl).toBe('http://f.png');
      expect(entry.status).toBe('ready'); // deriveVisualizationStatus: front ready → overall ready
    });

    it('no-ops for a missing entry', () => {
      updateVizPose('missing', 'front', makePoseEntry('ready', 'http://f.png'));
      expect(getVizEntry('missing')).toBeNull();
    });

    it('resolves through remap', () => {
      setVizEntry('new-id', { status: 'generating', poses: buildQueuedPoseEntries(), outfit: { id: 'new-id' } });
      remapVizEntryKey('old-id', 'new-id');
      updateVizPose('old-id', 'front', makePoseEntry('ready', 'http://f.png'));

      const entry = getVizEntry('new-id');
      expect(entry.poses.front.status).toBe('ready');
    });
  });

  describe('hydrateVizEntry', () => {
    it('writes when no entry exists', () => {
      const entry = { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://f.png' }), outfit: { id: 'o1' } };
      hydrateVizEntry('o1', entry);
      expect(getVizEntry('o1')).toEqual(entry);
    });

    it('skips write when entry is generating', () => {
      const generating = { status: 'generating', poses: buildQueuedPoseEntries(), outfit: { id: 'o1' } };
      setVizEntry('o1', generating);

      const ready = { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://f.png' }), outfit: { id: 'o1' } };
      hydrateVizEntry('o1', ready);

      expect(getVizEntry('o1').status).toBe('generating');
    });

    it('skips write when entry is queued', () => {
      const queued = { status: 'queued', poses: buildQueuedPoseEntries(), outfit: { id: 'o1' } };
      setVizEntry('o1', queued);

      hydrateVizEntry('o1', { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://f.png' }), outfit: { id: 'o1' } });

      expect(getVizEntry('o1').status).toBe('queued');
    });

    it('overwrites terminal entries', () => {
      setVizEntry('o1', { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://old.png' }), outfit: { id: 'o1' } });

      const newEntry = { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://new.png' }), outfit: { id: 'o1' } };
      hydrateVizEntry('o1', newEntry);

      expect(getVizEntry('o1').poses.front.imageUrl).toBe('http://new.png');
    });
  });

  describe('remapVizEntryKey', () => {
    it('re-keys an entry and resolves through remap', () => {
      setVizEntry('old-id', { status: 'generating', poses: buildQueuedPoseEntries(), outfit: { id: 'old-id' } });
      remapVizEntryKey('old-id', 'new-id');

      expect(getVizEntry('new-id')).not.toBeNull();
      expect(getVizEntry('new-id').status).toBe('generating');
      // Old ID resolves through remap
      expect(getVizEntry('old-id')).not.toBeNull();
      expect(getResolvedVizId('old-id')).toBe('new-id');
    });

    it('handles remap when no entry exists for old ID', () => {
      remapVizEntryKey('old-id', 'new-id');
      expect(getResolvedVizId('old-id')).toBe('new-id');
      expect(getVizEntry('old-id')).toBeNull();
    });
  });

  describe('pruneVizRegistry', () => {
    it('removes stale terminal entries not in active set', () => {
      setVizEntry('o1', { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://f.png' }), outfit: { id: 'o1' } });
      setVizEntry('o2', { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://f.png' }), outfit: { id: 'o2' } });
      setVizEntry('o3', { status: 'generating', poses: buildQueuedPoseEntries(), outfit: { id: 'o3' } });

      pruneVizRegistry(['o1']);

      expect(getVizEntry('o1')).not.toBeNull(); // active, kept
      expect(getVizEntry('o2')).toBeNull();      // not active + terminal, removed
      expect(getVizEntry('o3')).not.toBeNull(); // generating, always kept
    });

    it('preserves queued entries even if not in active set', () => {
      setVizEntry('o1', { status: 'queued', poses: buildQueuedPoseEntries(), outfit: { id: 'o1' } });
      pruneVizRegistry([]);
      expect(getVizEntry('o1')).not.toBeNull();
    });

    it('cleans stale remap entries', () => {
      setVizEntry('new-id', { status: 'ready', poses: buildReadyPoseEntries({ front: 'http://f.png' }), outfit: { id: 'new-id' } });
      remapVizEntryKey('old-id', 'new-id');

      pruneVizRegistry(['new-id']);

      // Remap was cleaned because new-id is in active set
      expect(getResolvedVizId('old-id')).toBe('old-id'); // no longer remapped
    });
  });

  describe('snapshot and subscription', () => {
    it('returns stable reference when unchanged', () => {
      setVizEntry('o1', { status: 'ready', poses: {}, outfit: { id: 'o1' } });
      const snap1 = getVizRegistrySnapshot();
      const snap2 = getVizRegistrySnapshot();
      expect(snap1).toBe(snap2);
    });

    it('returns new reference after mutation', () => {
      setVizEntry('o1', { status: 'ready', poses: {}, outfit: { id: 'o1' } });
      const snap1 = getVizRegistrySnapshot();
      setVizEntry('o2', { status: 'ready', poses: {}, outfit: { id: 'o2' } });
      const snap2 = getVizRegistrySnapshot();
      expect(snap1).not.toBe(snap2);
    });

    it('notifies subscribers on change', () => {
      const spy = vi.fn();
      const unsub = subscribeVizRegistry(spy);

      setVizEntry('o1', { status: 'ready', poses: {}, outfit: { id: 'o1' } });
      expect(spy).toHaveBeenCalledTimes(1);

      updateVizPose('o1', 'front', makePoseEntry('generating'));
      expect(spy).toHaveBeenCalledTimes(2);

      unsub();
      setVizEntry('o2', { status: 'ready', poses: {}, outfit: { id: 'o2' } });
      expect(spy).toHaveBeenCalledTimes(2); // unsubscribed, no more calls
    });
  });

  describe('__resetVizRegistryForTests', () => {
    it('clears all state', () => {
      setVizEntry('o1', { status: 'ready', poses: {}, outfit: { id: 'o1' } });
      remapVizEntryKey('old', 'new');
      const spy = vi.fn();
      subscribeVizRegistry(spy);

      __resetVizRegistryForTests();

      expect(getVizEntry('o1')).toBeNull();
      expect(getResolvedVizId('old')).toBe('old');
      expect(getVizRegistrySnapshot()).toEqual({});

      // Listener was cleared
      setVizEntry('o2', { status: 'ready', poses: {}, outfit: { id: 'o2' } });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('helper functions', () => {
    it('makePoseEntry includes partialImageUrl', () => {
      const entry = makePoseEntry('generating', null, null, 'http://partial.png');
      expect(entry).toEqual({ status: 'generating', imageUrl: null, error: null, partialImageUrl: 'http://partial.png' });
    });

    it('buildQueuedPoseEntries creates all three poses as queued', () => {
      const poses = buildQueuedPoseEntries();
      expect(poses.front.status).toBe('queued');
      expect(poses.angle.status).toBe('queued');
      expect(poses.seated.status).toBe('queued');
    });

    it('buildReadyPoseEntries marks missing poses as idle', () => {
      const poses = buildReadyPoseEntries({ front: 'http://f.png' });
      expect(poses.front.status).toBe('ready');
      expect(poses.angle.status).toBe('idle');
      expect(poses.seated.status).toBe('idle');
    });

    it('deriveVisualizationStatus returns ready when front is ready', () => {
      const poses = {
        front: makePoseEntry('ready', 'http://f.png'),
        angle: makePoseEntry('queued'),
        seated: makePoseEntry('queued'),
      };
      expect(deriveVisualizationStatus(poses)).toBe('ready');
    });

    it('deriveVisualizationStatus returns generating when any pose is generating', () => {
      const poses = {
        front: makePoseEntry('queued'),
        angle: makePoseEntry('generating'),
        seated: makePoseEntry('queued'),
      };
      expect(deriveVisualizationStatus(poses)).toBe('generating');
    });

    it('hasPendingVisualizationPose detects generating/queued', () => {
      expect(hasPendingVisualizationPose({ front: makePoseEntry('generating') })).toBe(true);
      expect(hasPendingVisualizationPose({ front: makePoseEntry('ready', 'http://f.png') })).toBe(false);
    });
  });
});
