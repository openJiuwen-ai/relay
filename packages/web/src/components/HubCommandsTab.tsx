/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { COMMAND_CATEGORIES, COMMANDS, type CommandCategory } from '@/config/command-registry';
import { SHORTCUTS } from '@/config/shortcut-registry';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
      <h3 className="text-xs font-semibold text-gray-700 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function CommandGroup({ category, label }: { category: CommandCategory; label: string }) {
  const cmds = COMMANDS.filter((c) => c.category === category);
  if (cmds.length === 0) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="space-y-1">
        {cmds.map((cmd) => (
          <div key={cmd.name + cmd.usage} className="flex items-baseline gap-3 text-xs">
            <code className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">{cmd.usage}</code>
            <span className="text-gray-600">{cmd.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HubCommandsTab() {
  const categoryOrder: CommandCategory[] = ['general', 'memory', 'knowledge', 'game', 'task', 'vote', 'connector'];

  return (
    <>
      <Section title="斜杠命令">
        {categoryOrder.map((cat) => (
          <CommandGroup key={cat} category={cat} label={COMMAND_CATEGORIES[cat]} />
        ))}
      </Section>

      <Section title="快捷键">
        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-baseline gap-3 text-xs">
              <kbd className="font-mono text-gray-700 bg-gray-200 px-1.5 py-0.5 rounded shrink-0">{s.keys}</kbd>
              <span className="text-gray-600">{s.description}</span>
              {s.context !== '全局' && <span className="text-[10px] text-gray-400 ml-auto">({s.context})</span>}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
