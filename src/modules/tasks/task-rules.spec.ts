import { TaskAction, TaskStatus } from '../../common/enums';
import { allowedActions, buildGraph, createsCycle, distancesFrom, rejectionReason } from './task-rules';

describe('task rules', () => {
  describe('allowedActions', () => {
    it('allows Start only when nothing it waits on is open', () => {
      expect(
        allowedActions({ status: TaskStatus.NOT_STARTED, openDependencies: 0, hasStartedDependents: false }),
      ).toEqual([TaskAction.START]);
      expect(
        allowedActions({ status: TaskStatus.NOT_STARTED, openDependencies: 2, hasStartedDependents: false }),
      ).toEqual([]);
    });

    it('allows Mark as done from In progress', () => {
      expect(
        allowedActions({ status: TaskStatus.IN_PROGRESS, openDependencies: 0, hasStartedDependents: false }),
      ).toEqual([TaskAction.COMPLETE]);
    });

    it('allows Reopen only while no dependent has started', () => {
      expect(allowedActions({ status: TaskStatus.DONE, openDependencies: 0, hasStartedDependents: false })).toEqual([
        TaskAction.REOPEN,
      ]);
      expect(allowedActions({ status: TaskStatus.DONE, openDependencies: 0, hasStartedDependents: true })).toEqual([]);
    });

    it('explains rejected transitions', () => {
      const done = { status: TaskStatus.DONE, openDependencies: 0, hasStartedDependents: false };
      expect(rejectionReason(TaskAction.START, done)).toMatch(/not started/);
      expect(rejectionReason(TaskAction.COMPLETE, done)).toMatch(/in progress/);
      expect(rejectionReason(TaskAction.REOPEN, done)).toBeUndefined();
    });
  });

  describe('graph', () => {
    // C -> B -> A (chain) and D -> A, D -> C (side by side)
    const A = 1,
      B = 2,
      C = 3,
      D = 4;
    const graph = buildGraph([
      { taskId: B, dependsOnId: A },
      { taskId: C, dependsOnId: B },
      { taskId: D, dependsOnId: A },
      { taskId: D, dependsOnId: C },
    ]);

    it('finds every task a task waits on, with the shortest distance', () => {
      const waitsOn = distancesFrom(D, graph.dependsOn);
      expect(Object.fromEntries(waitsOn)).toEqual({ [A]: 1, [C]: 1, [B]: 2 });
    });

    it('finds every task that waits on a task', () => {
      const waitedBy = distancesFrom(A, graph.dependents);
      expect(Object.fromEntries(waitedBy)).toEqual({ [B]: 1, [D]: 1, [C]: 2 });
    });

    it('rejects direct and indirect cycles', () => {
      expect(createsCycle(A, A, graph)).toBe(true); // self
      expect(createsCycle(A, B, graph)).toBe(true); // A -> B -> A
      expect(createsCycle(A, D, graph)).toBe(true); // A -> D -> C -> B -> A
      expect(createsCycle(D, B, graph)).toBe(false); // already implied, but no cycle
    });

    it('handles diamond-heavy graphs in linear time', () => {
      // 2000 layers of diamonds: exponential number of paths, linear BFS.
      const edges = [];
      for (let i = 0; i < 2000; i++) {
        const base = i * 3;
        edges.push({ taskId: base + 1, dependsOnId: base }, { taskId: base + 2, dependsOnId: base });
        edges.push({ taskId: base + 3, dependsOnId: base + 1 }, { taskId: base + 3, dependsOnId: base + 2 });
      }
      const g = buildGraph(edges);
      const reach = distancesFrom(6000, g.dependsOn);
      expect(reach.get(0)).toBe(4000);
      expect(createsCycle(0, 6000, g)).toBe(true);
    });
  });
});
