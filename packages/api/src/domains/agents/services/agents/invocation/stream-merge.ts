/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Async Stream Merger
 * 合并多个 AsyncIterable，谁先 yield 谁先出。
 * 所有流结束后完成。单个流报错不影响其他流。
 *
 * 算法: Promise.race 池
 * 1. 每个 AsyncIterable 转 AsyncIterator
 * 2. 每个 iterator 调 .next() 放入 race 池
 * 3. race 出第一个结果 → yield → 重新填入该 iterator 的下一个 promise
 * 4. iterator done → 移出池
 * 5. iterator reject → 以 onError 回调通知调用方, 移出池
 * 6. 池空 → generator 结束
 */

/** Tagged promise so we know which stream resolved */
interface TaggedResult<T> {
  index: number;
  result: IteratorResult<T>;
}

interface TaggedError {
  index: number;
  error: unknown;
}

type TaggedOutcome<T> = { ok: true; value: TaggedResult<T> } | { ok: false; value: TaggedError };

/**
 * Merge multiple async iterables, yielding values as they arrive.
 * @param streams The async iterables to merge
 * @param onError Optional callback when a stream errors (stream is removed from pool)
 */
export async function* mergeStreams<T>(
  streams: AsyncIterable<T>[],
  onError?: (index: number, error: unknown) => void,
): AsyncGenerator<T> {
  if (streams.length === 0) return;
  if (streams.length === 1) {
    yield* streams[0]!;
    return;
  }

  const iterators = streams.map((s) => s[Symbol.asyncIterator]());
  const pending = new Map<number, Promise<TaggedOutcome<T>>>();

  // Arm an iterator: call .next() and wrap in tagged promise
  function arm(index: number): void {
    const it = iterators[index];
    if (!it) return;
    pending.set(
      index,
      it.next().then(
        (result): TaggedOutcome<T> => ({ ok: true, value: { index, result } }),
        (error): TaggedOutcome<T> => ({ ok: false, value: { index, error } }),
      ),
    );
  }

  // Arm all iterators initially
  for (let i = 0; i < iterators.length; i++) {
    arm(i);
  }

  while (pending.size > 0) {
    const outcome = await Promise.race(pending.values());

    if (outcome.ok) {
      const { index, result } = outcome.value;
      if (result.done) {
        pending.delete(index);
      } else {
        yield result.value;
        arm(index); // Re-arm for next value
      }
    } else {
      const { index, error } = outcome.value;
      pending.delete(index);
      onError?.(index, error);
    }
  }
}
