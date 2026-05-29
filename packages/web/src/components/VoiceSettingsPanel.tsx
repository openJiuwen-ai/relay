/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import React, { useRef, useState } from 'react';
import { type CustomTerm, useVoiceSettingsStore } from '@/stores/voiceSettingsStore';
import builtInTerms from '@/utils/voice-terms.json';

const BUILT_IN_ENTRIES = Object.entries(builtInTerms as Record<string, string>).filter(
  ([k]) => !k.startsWith('_comment'),
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
      <h3 className="mb-2 text-xs font-semibold text-gray-700">{title}</h3>
      {children}
    </section>
  );
}

function AddTermRow({ onAdd }: { onAdd: (from: string, to: string) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const toRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!from.trim() || !to.trim()) return;
    onAdd(from.trim(), to.trim());
    setFrom('');
    setTo('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd();
  };

  const handleFromKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && from.trim() && !to.trim()) {
      toRef.current?.focus();
      return;
    }
    handleKeyDown(e);
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        placeholder="识别词"
        className="ui-input flex-1 rounded px-2 py-1.5 text-xs"
        onKeyDown={handleFromKeyDown}
      />
      <span className="text-xs text-gray-400">&rarr;</span>
      <input
        ref={toRef}
        type="text"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="纠正词"
        className="ui-input flex-1 rounded px-2 py-1.5 text-xs"
        onKeyDown={handleKeyDown}
      />
      <button
        onClick={handleAdd}
        disabled={!from.trim() || !to.trim()}
        className="rounded bg-blue-500 px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        添加
      </button>
    </div>
  );
}

function CustomTermRow({
  term,
  index,
  onUpdate,
  onRemove,
}: {
  term: CustomTerm;
  index: number;
  onUpdate: (index: number, from: string, to: string) => void;
  onRemove: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editFrom, setEditFrom] = useState(term.from);
  const [editTo, setEditTo] = useState(term.to);

  const startEdit = () => {
    setEditFrom(term.from);
    setEditTo(term.to);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!editFrom.trim() || !editTo.trim()) return;
    onUpdate(index, editFrom.trim(), editTo.trim());
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <input
          type="text"
          value={editFrom}
          onChange={(e) => setEditFrom(e.target.value)}
          onKeyDown={handleEditKeyDown}
          className="ui-input flex-1 rounded px-1.5 py-0.5"
        />
        <span className="text-gray-400">&rarr;</span>
        <input
          type="text"
          value={editTo}
          onChange={(e) => setEditTo(e.target.value)}
          onKeyDown={handleEditKeyDown}
          className="ui-input flex-1 rounded px-1.5 py-0.5"
        />
        <button
          onClick={saveEdit}
          disabled={!editFrom.trim() || !editTo.trim()}
          className="text-blue-500 hover:text-blue-700 disabled:opacity-40"
          title="保存"
        >
          &#10003;
        </button>
        <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600" title="取消">
          &#10005;
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <code className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{term.from}</code>
      <span className="text-gray-400">&rarr;</span>
      <code className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">{term.to}</code>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={startEdit} className="text-gray-400 transition-colors hover:text-blue-500" title="编辑">
          &#9998;
        </button>
        <button onClick={() => onRemove(index)} className="text-gray-400 transition-colors hover:text-red-500" title="删除">
          &times;
        </button>
      </div>
    </div>
  );
}

export function VoiceSettingsPanel() {
  const { settings, addTerm, updateTerm, removeTerm, setLanguage, resetAll } = useVoiceSettingsStore();
  const [showBuiltIn, setShowBuiltIn] = useState(false);

  return (
    <>
      <Section title="自定义术语纠正">
        <p className="mb-2 text-[11px] text-gray-500">添加你的识别纠正规则。自定义规则优先于内置词典。</p>
        {settings.customTerms.length > 0 ? (
          <div className="mb-1 space-y-1.5">
            {settings.customTerms.map((term, i) => (
              <CustomTermRow key={`${term.from}-${i}`} term={term} index={i} onUpdate={updateTerm} onRemove={removeTerm} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] italic text-gray-400">暂无自定义规则</p>
        )}
        <AddTermRow onAdd={addTerm} />
      </Section>

      <Section title="内置词典">
        <button
          onClick={() => setShowBuiltIn(!showBuiltIn)}
          className="text-[11px] text-blue-500 transition-colors hover:text-blue-700"
        >
          {showBuiltIn ? '收起' : `查看全部 ${BUILT_IN_ENTRIES.length} 条内置规则`}
        </button>
        {showBuiltIn && (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {BUILT_IN_ENTRIES.map(([from, to]) => (
              <div key={from} className="flex items-center gap-2 text-xs text-gray-500">
                <code className="rounded bg-gray-100 px-1.5 py-0.5">{from}</code>
                <span>&rarr;</span>
                <code className="rounded bg-gray-100 px-1.5 py-0.5">{to}</code>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="语言设置">
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-600">转写语言</label>
          <select
            value={settings.language}
            onChange={(e) => setLanguage(e.target.value as typeof settings.language)}
            className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="">自动检测</option>
          </select>
        </div>
      </Section>

      <div className="flex justify-end">
        <button onClick={resetAll} className="text-xs text-gray-400 transition-colors hover:text-red-500">
          重置所有设置
        </button>
      </div>
    </>
  );
}
