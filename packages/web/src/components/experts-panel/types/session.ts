/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export interface Session {
  id: string;
  name: string;
  description: string;
  avatar: string;
  channel?: 'all' | 'wechat' | 'email' | 'dingtalk';
}

export interface SelectSessionModalProps {
  open: boolean;
  onClose: () => void;
  expertId: string;
  expertMentionPattern?: string;
  onConfirm: (sessionId: string) => void;
  onCreateNew: () => void;
}