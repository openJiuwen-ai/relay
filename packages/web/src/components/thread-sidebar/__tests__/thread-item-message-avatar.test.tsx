/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useAuthorizationPendingStore } from "@/stores/authorizationPendingStore";
import { DEFAULT_THREAD_STATE } from "@/stores/chat-types";
import { ThreadItem } from "../ThreadItem";

vi.mock("@/hooks/useAgentData", () => ({
  useAgentData: () => ({
    agents: [],
    getAgentById: (id: string) =>
      ({
        jiuwenclaw: {
          id: "jiuwenclaw",
          displayName: "九文爪",
          avatar: "/avatars/jiuwen.png",
          color: { primary: "#123456", secondary: "#abcdef" },
        },
        codex: {
          id: "codex",
          displayName: "办公智能体",
          avatar: "/avatars/codex.png",
          color: { primary: "#654321", secondary: "#fedcba" },
        },
      })[id],
  }),
}));

vi.mock("@/hooks/useExpertCatalog", () => ({
  useExpertCatalog: () => ({
    experts: [],
    isLoading: false,
    refresh: vi.fn(),
    getExpertById: (id: string) =>
      ({
        "expert-poetry": {
          expertId: "expert-poetry",
          displayName: "古诗词创作专家",
          avatar: "/avatars/codex.png",
          category: "content",
          mentionPatterns: ["@expert-poetry", "@古诗词创作专家"],
          roleDescription: "诗词创作",
        },
      } as Record<string, unknown>)[id] as
        | {
            expertId: string;
            displayName: string;
            avatar: string;
            category: string;
            mentionPatterns: string[];
            roleDescription: string;
          }
        | undefined,
  }),
}));

vi.mock("@/utils/api-client", () => ({
  API_URL: "http://localhost:3102",
}));

describe("ThreadItem message avatar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useAuthorizationPendingStore.setState({ pendingByThread: {}, threadByRequest: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("shows avatar from mentioned cat id in thread messages when thread has no participants yet", () => {
    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: "thread-1",
          title: "新线程",
          participants: [],
          lastActiveAt: Date.now(),
          isActive: false,
          onSelect: vi.fn(),
          threadState: {
            ...DEFAULT_THREAD_STATE,
            unreadCount: 0,
            messages: [
              {
                id: "msg-1",
                type: "user",
                content: "请 @jiuwenclaw 处理这个会话",
                timestamp: Date.now(),
              },
            ],
          },
        }),
      );
    });

    const img = container.querySelector(
      'img[alt="九文爪"]',
    ) as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/avatars/jiuwen.png");
  });

  it("prefers the latest assistant reply for sidebar avatar and description across refreshes", () => {
    const now = Date.now();

    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: "thread-2",
          title: "历史刷新",
          participants: [],
          lastActiveAt: now,
          isActive: false,
          onSelect: vi.fn(),
          threadState: {
            ...DEFAULT_THREAD_STATE,
            unreadCount: 0,
            targetAgents: ["jiuwenclaw"],
            messages: [
              {
                id: "msg-user",
                type: "user",
                content: "请 @jiuwenclaw 处理这个会话",
                timestamp: now - 1_000,
              },
              {
                id: "msg-assistant",
                type: "assistant",
                agentId: "codex",
                content: "我来处理",
                timestamp: now,
              },
            ],
          },
        }),
      );
    });

    let img = container.querySelector(
      'img[alt="办公智能体"]',
    ) as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/avatars/codex.png");
    expect(container.textContent).toContain("办公智能体");

    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: "thread-2",
          title: "历史刷新",
          participants: [],
          lastActiveAt: now,
          isActive: false,
          onSelect: vi.fn(),
          threadState: {
            ...DEFAULT_THREAD_STATE,
            unreadCount: 0,
            targetAgents: [],
            messages: [
              {
                id: "msg-user",
                type: "user",
                content: "请 @jiuwenclaw 处理这个会话",
                timestamp: now - 1_000,
              },
              {
                id: "msg-assistant",
                type: "assistant",
                agentId: "codex",
                content: "我来处理",
                timestamp: now,
              },
            ],
          },
        }),
      );
    });

    img = container.querySelector(
      'img[alt="办公智能体"]',
    ) as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/avatars/codex.png");
    expect(container.textContent).toContain("办公智能体");
    expect(container.textContent).not.toContain("九文爪");
  });

  it("renders a 32x32 sidebar avatar and keeps png images proportionally scaled", () => {
    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: "thread-1",
          title: "avatar-size-check",
          participants: ["jiuwenclaw"],
          lastActiveAt: Date.now(),
          isActive: false,
          onSelect: vi.fn(),
          threadState: DEFAULT_THREAD_STATE,
        }),
      );
    });

    const avatarImage = container.querySelector(
      'img[alt="九文爪"]',
    ) as HTMLImageElement | null;
    const avatarShell = avatarImage?.parentElement as HTMLDivElement | null;

    expect(avatarShell).toBeTruthy();
    expect(avatarShell?.style.width).toBe("32px");
    expect(avatarShell?.style.height).toBe("32px");
    expect(avatarImage).toBeTruthy();
    expect(avatarImage?.className).toContain("object-cover");
  });

  it("shows expert display name in the participant subtitle instead of raw id", () => {
    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: "thread-expert",
          title: "专家会话",
          participants: ["expert-poetry"],
          lastActiveAt: Date.now(),
          isActive: false,
          onSelect: vi.fn(),
          threadState: DEFAULT_THREAD_STATE,
        }),
      );
    });

    expect(container.textContent).toContain("古诗词创作专家");
    expect(container.textContent).not.toContain("expert-poetry");
  });

  it("renders icon-only rows with avatar, right tooltip, and keeps click selection", async () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();

    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: "thread-icon-only",
          title: "icon-only-hidden-title",
          participants: ["jiuwenclaw"],
          lastActiveAt: Date.now(),
          isActive: false,
          onSelect,
          threadState: {
            ...DEFAULT_THREAD_STATE,
            unreadCount: 3,
          },
          iconOnly: true,
        }),
      );
    });

    const row = container.querySelector(
      ".ui-thread-item",
    ) as HTMLDivElement | null;
    const avatarImage = container.querySelector(
      'img[alt="九文爪"]',
    ) as HTMLImageElement | null;
    const avatarShell = avatarImage?.parentElement as HTMLDivElement | null;
    expect(row).toBeTruthy();
    expect(row?.className).toContain("h-8");
    expect(row?.className).toContain("w-8");
    expect(row?.style.minHeight).toBe("0");
    expect(row?.style.padding).toBe("0px");
    expect(row?.getAttribute("title")).toBeNull();
    expect(row?.getAttribute("aria-label")).toBe("icon-only-hidden-title");
    expect(avatarImage).toBeTruthy();
    expect(avatarShell?.style.width).toBe("20px");
    expect(avatarShell?.style.height).toBe("20px");
    expect(container.querySelector(".ui-thread-title")).toBeNull();
    expect(
      container.querySelector('[data-testid="thread-item-icon-tooltip"]'),
    ).toBeNull();
    await act(async () => {
      row?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip?.dataset.placement).toBe("right");
    expect(tooltip?.textContent).toContain("icon-only-hidden-title");
    expect(container.querySelector(".ui-thread-description")).toBeNull();
    expect(container.querySelector(".ui-thread-meta")).toBeNull();
    expect(container.querySelector('button[aria-label="更多操作"]')).toBeNull();
    expect(container.textContent).toContain("3");

    act(() => {
      row?.click();
    });

    expect(onSelect).toHaveBeenCalledWith("thread-icon-only");
    vi.useRealTimers();
  });

  it("uses the shared tooltip for the thread title instead of a native title attribute", async () => {
    vi.useFakeTimers();
    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: "thread-2",
          title: "very-long-thread-title-for-tooltip",
          participants: [],
          lastActiveAt: Date.now(),
          isActive: false,
          onSelect: vi.fn(),
          threadState: DEFAULT_THREAD_STATE,
        }),
      );
    });
    await flush();

    const row = container.querySelector(
      ".ui-thread-item",
    ) as HTMLDivElement | null;
    const title = container.querySelector(
      ".ui-thread-title",
    ) as HTMLSpanElement | null;
    expect(row).toBeTruthy();
    expect(row?.getAttribute("title")).toBeNull();
    expect(title).toBeTruthy();

    Object.defineProperty(title!, "clientWidth", {
      configurable: true,
      value: 80,
    });
    Object.defineProperty(title!, "scrollWidth", {
      configurable: true,
      value: 220,
    });
    Object.defineProperty(title!, "clientHeight", {
      configurable: true,
      value: 20,
    });
    Object.defineProperty(title!, "scrollHeight", {
      configurable: true,
      value: 20,
    });

    await act(async () => {
      title?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    await flush();

    const tooltip = document.body.querySelector(
      '[role="tooltip"]',
    ) as HTMLDivElement | null;
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain(
      "very-long-thread-title-for-tooltip",
    );
    vi.useRealTimers();
  });

  it("shows pending approval subtitle with fixed warning color when thread has pending auth", () => {
    useAuthorizationPendingStore.getState().registerPending("thread-approval", "req-1");

    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: "thread-approval",
          title: "需要审批",
          participants: [],
          lastActiveAt: Date.now(),
          isActive: true,
          onSelect: vi.fn(),
          threadState: DEFAULT_THREAD_STATE,
        }),
      );
    });

    const subtitle = container.querySelector(".ui-thread-description") as HTMLSpanElement | null;
    expect(subtitle?.textContent).toBe("审批待处理");
    expect(subtitle?.style.color).toBe("rgb(255, 136, 0)");
  });
});
