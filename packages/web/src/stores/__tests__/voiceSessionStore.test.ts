/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useVoiceSessionStore } from '../voiceSessionStore';

beforeEach(() => {
  useVoiceSessionStore.setState({ session: null });
});

describe('voiceSessionStore', () => {
  it('starts with no session', () => {
    expect(useVoiceSessionStore.getState().session).toBeNull();
  });

  it('start() creates a session bound to thread + cat', () => {
    useVoiceSessionStore.getState().start('thread-1', 'opus', true);
    const session = useVoiceSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.boundThreadId).toBe('thread-1');
    expect(session?.activeCatId).toBe('opus');
    expect(session?.voiceMode).toBe(true);
    expect(session?.autoplayUnlocked).toBe(true);
    expect(session?.playbackState).toBe('idle');
    expect(session?.sessionId).toMatch(/^vs-/);
  });

  it('start() with autoplayUnlocked=false marks session as not unlocked', () => {
    useVoiceSessionStore.getState().start('thread-1', 'opus', false);
    const session = useVoiceSessionStore.getState().session;
    expect(session?.autoplayUnlocked).toBe(false);
  });

  it('confirmAutoplayUnlocked() sets autoplayUnlocked to true', () => {
    useVoiceSessionStore.getState().start('thread-1', 'opus', false);
    expect(useVoiceSessionStore.getState().session?.autoplayUnlocked).toBe(false);
    useVoiceSessionStore.getState().confirmAutoplayUnlocked();
    expect(useVoiceSessionStore.getState().session?.autoplayUnlocked).toBe(true);
  });

  it('confirmAutoplayUnlocked() is no-op when no session', () => {
    useVoiceSessionStore.getState().confirmAutoplayUnlocked();
    expect(useVoiceSessionStore.getState().session).toBeNull();
  });

  it('stop() clears the session', () => {
    useVoiceSessionStore.getState().start('thread-1', 'opus', true);
    expect(useVoiceSessionStore.getState().session).not.toBeNull();
    useVoiceSessionStore.getState().stop();
    expect(useVoiceSessionStore.getState().session).toBeNull();
  });

  it('setPlaybackState() updates playback state', () => {
    useVoiceSessionStore.getState().start('thread-1', 'opus', true);
    useVoiceSessionStore.getState().setPlaybackState('playing');
    expect(useVoiceSessionStore.getState().session?.playbackState).toBe('playing');
    useVoiceSessionStore.getState().setPlaybackState('idle');
    expect(useVoiceSessionStore.getState().session?.playbackState).toBe('idle');
  });

  it('setPlaybackState() is no-op when no session', () => {
    useVoiceSessionStore.getState().setPlaybackState('playing');
    expect(useVoiceSessionStore.getState().session).toBeNull();
  });

  it('markPlayed() tracks played block IDs', () => {
    useVoiceSessionStore.getState().start('thread-1', 'opus', true);
    expect(useVoiceSessionStore.getState().hasPlayed('block-1')).toBe(false);
    useVoiceSessionStore.getState().markPlayed('block-1');
    expect(useVoiceSessionStore.getState().hasPlayed('block-1')).toBe(true);
    expect(useVoiceSessionStore.getState().hasPlayed('block-2')).toBe(false);
  });

  it('markPlayed() is no-op when no session', () => {
    useVoiceSessionStore.getState().markPlayed('block-1');
    expect(useVoiceSessionStore.getState().session).toBeNull();
  });

  it('hasPlayed() returns false when no session', () => {
    expect(useVoiceSessionStore.getState().hasPlayed('block-1')).toBe(false);
  });

  it('each start() creates a unique sessionId', () => {
    useVoiceSessionStore.getState().start('t1', 'opus', true);
    const id1 = useVoiceSessionStore.getState().session?.sessionId;
    useVoiceSessionStore.getState().stop();
    useVoiceSessionStore.getState().start('t2', 'codex', true);
    const id2 = useVoiceSessionStore.getState().session?.sessionId;
    expect(id1).not.toBe(id2);
  });

  it('start() resets played blocks from previous session', () => {
    useVoiceSessionStore.getState().start('t1', 'opus', true);
    useVoiceSessionStore.getState().markPlayed('block-old');
    useVoiceSessionStore.getState().start('t2', 'opus', true);
    expect(useVoiceSessionStore.getState().hasPlayed('block-old')).toBe(false);
  });
});
