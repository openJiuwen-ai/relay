/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { EvidenceResult } from './EvidenceCard';
import { EvidenceCard } from './EvidenceCard';

export interface EvidenceData {
  results: EvidenceResult[];
  degraded: boolean;
  degradeReason?: string;
}

/**
 * EvidencePanel — 证据检索结果面板
 */
export function EvidencePanel({ data }: { data: EvidenceData }) {
  return (
    <div className="flex justify-center mb-6">
      <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-600 rounded-2xl px-5 pt-4 pb-4 max-w-lg w-full shadow-sm shadow-slate-900/30">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-200 tracking-wide uppercase">Hindsight 检索结果</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-600 text-slate-300 font-bold">
              {data.results.length}
            </span>
          </div>
          {data.degraded && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-400 animate-pulse">
              <span>⚠️</span>
              <span>局部模式</span>
            </div>
          )}
        </div>

        {/* Degraded info if present */}
        {data.degraded && (
          <div className="text-[10px] text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2 mb-3 leading-relaxed italic">
            {'\u201c'}哎呀，有些记忆暂时找不到了，正在为您从本地文档中努力搜寻...{'\u201d'}
          </div>
        )}

        {/* Results */}
        {data.results.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-6 font-medium italic">暂未找到相关证据</div>
        ) : (
          <div className="space-y-2">
            {data.results.map((result, i) => (
              <EvidenceCard key={`${result.anchor}-${i}`} result={result} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
