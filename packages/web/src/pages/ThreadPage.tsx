/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useParams } from 'react-router-dom';
import { ChatContainer } from '@/components/ChatContainer';

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();

  return <ChatContainer mode="thread" threadId={threadId ?? ''} />;
}
