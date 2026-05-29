/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ReactNode, type RefObject, useCallback, useState } from 'react';

export interface PreviewPanelShellProps {
  panelTestId: string;
  title: string;
  /**
   * 传入时全屏使用 `absolute inset-0`，相对于祖先中已设置 `position: relative` 的「会话 + 侧栏」根容器
   * （如 ChatContainer 内层 `flex-1`），避免 `fixed` + `getBoundingClientRect` 在缩放下的偏差。
   * 省略时全屏为视口级 `fixed inset-0`。
   */
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
  /** 关闭时先退出全屏，再调用（例如收起 store 中的预览态） */
  onRequestClose: () => void;
  onOpenFolder?: () => void;
  folderButtonTitle?: string;
  /** 自定义header按钮区域，放在全屏/关闭按钮之前 */
  headerActions?: ReactNode;
  /**
   * 插入到 header 右侧按钮组最左侧的自定义内容（不影响现有使用方）。
   * 用于在小屏时插入文件切换下拉按钮等自定义控件。
   */
  extraHeaderContent?: ReactNode;
  /**
   * 隐藏 shell 自带的左侧边框（当外层已有 ResizeHandle 提供分割线时使用，避免双边框）。
   */
  hideBorderLeft?: boolean;
  /** 仅展示标题与 extraHeaderContent，不渲染文件夹 / 全屏 / 关闭（由外层顶栏承担时） */
  hideHeaderActions?: boolean;
  /** 受控全屏；与 onFullScreenChange 同时传入时由内层与外层同步 */
  fullScreen?: boolean;
  onFullScreenChange?: (next: boolean) => void;
  /** 替换默认 `<h2>` 标题（如窄屏下整块标题区可点击下拉） */
  titleContent?: ReactNode;
  children: ReactNode;
}

export function PreviewPanelShell({
  panelTestId,
  title,
  fullScreenContainerRef,
  onRequestClose,
  onOpenFolder,
  folderButtonTitle = '打开所在文件夹',
  headerActions,
  extraHeaderContent,
  hideBorderLeft = false,
  hideHeaderActions = false,
  fullScreen: fullScreenControlled,
  onFullScreenChange,
  titleContent,
  children,
}: PreviewPanelShellProps) {
  const [internalFullScreen, setInternalFullScreen] = useState(false);
  const isControlledFs = fullScreenControlled !== undefined;
  const isFullScreen = isControlledFs ? fullScreenControlled : internalFullScreen;
  const useAnchoredFullScreen = fullScreenContainerRef != null;

  const setFullScreen = useCallback(
    (next: boolean) => {
      onFullScreenChange?.(next);
      if (!isControlledFs) setInternalFullScreen(next);
    },
    [isControlledFs, onFullScreenChange],
  );

  const handleToggleFullScreen = useCallback(() => {
    setFullScreen(!isFullScreen);
  }, [isFullScreen, setFullScreen]);

  const handleClose = useCallback(() => {
    setFullScreen(false);
    onRequestClose();
  }, [onRequestClose, setFullScreen]);

  return (
    <section
      data-testid={panelTestId}
      className={`flex min-h-0 flex-col ${
        isFullScreen
          ? useAnchoredFullScreen
            ? 'absolute inset-0 z-[100] min-h-0 overflow-hidden'
            : 'fixed inset-0 z-[100] h-screen w-screen min-h-0 overflow-hidden'
          : `h-full min-h-0 w-full min-w-0${hideBorderLeft ? '' : ' border-l border-gray-200'}`
      } bg-white shadow-xl`}
    >
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#F0F0F0] bg-white px-5">
        {titleContent != null ? (
          <div className="mr-3 min-h-0 min-w-0 flex-1">{titleContent}</div>
        ) : (
          <h2 className="mr-3 min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-[#1F1F1F]" title={title}>
            {title}
          </h2>
        )}
        <div className="flex shrink-0 items-center gap-1 text-[#191919]">
          {extraHeaderContent ?? null}
          {headerActions}
          {hideHeaderActions ? null : (
            <>
              {onOpenFolder ? (
                <button
                  type="button"
                  onClick={() => {
                    void onOpenFolder();
                  }}
                  className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[#F5F5F7]"
                  title={folderButtonTitle}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 16.2673 16.2673"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <title>{folderButtonTitle}</title>
                    <path
                      fill="currentColor"
                      fillRule="nonzero"
                      transform="matrix(0.999858 0.0168466 -0.0168466 0.999858 1.66809 2.20746)"
                      d="M3.81828 0C3.98772 0 4.1517 0.0599236 4.28122 0.169172L6.478 2.022L11.4008 2.0227C12.2302 2.0227 12.9112 2.65767 12.9843 3.46798L12.9908 3.6127L12.9907 4.216L13.6391 4.21663L13.7626 4.22557C14.0338 4.27753 14.2115 4.53952 14.1596 4.81073L13.0108 10.8057C12.9993 10.8661 12.9773 10.9218 12.9471 10.9714C12.6555 11.5117 12.0462 11.8345 11.4008 11.8345L2.68082 11.8345C1.20085 11.8343 0.00106351 10.6346 0.000718276 9.15453L0 1.58991C0 0.711781 0.711863 0 1.59 0L3.81828 0ZM13.0633 5.216L3.152 5.216L2.0962 10.7299C2.2783 10.7975 2.47529 10.8344 2.6809 10.8345L11.4008 10.8345C11.668 10.8345 11.8887 10.7435 12.0063 10.5974L13.0633 5.216ZM3.715 1L1.59 1C1.29671 1 1.05344 1.21391 1.00772 1.49418L1 1.58986L1.00072 9.15436C1.00079 9.45657 1.08064 9.74015 1.22034 9.98516L2.24806 4.62254C2.25354 4.59396 2.26135 4.56642 2.27125 4.54007C2.27663 4.52849 2.29689 4.4827 2.30313 4.47161C2.31207 4.45959 2.35474 4.39649 2.36486 4.38508C2.37554 4.37663 2.45096 4.30775 2.46224 4.30024C2.53624 4.25649 2.64651 4.21663 2.73913 4.21663L11.9907 4.216L11.9908 3.6127C11.9908 3.28686 11.7267 3.0227 11.4008 3.0227L6.37559 3.0227C6.20615 3.0227 6.04217 2.96278 5.91265 2.85353L3.715 1Z"
                    />
                  </svg>
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleToggleFullScreen}
                className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[#F5F5F7]"
                title={isFullScreen ? '退出全屏' : '全屏预览'}
              >
                {isFullScreen ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <title>退出全屏</title>
                    <path
                      fill="currentColor"
                      fillRule="nonzero"
                      d="M5.96105 8.53895C6.78948 8.53895 7.46105 9.21052 7.46105 10.0389L7.46105 13.5C7.46105 13.7761 7.23719 14 6.96105 14C6.68491 14 6.46105 13.7761 6.46105 13.5L6.46067 10.2453L3.15939 13.5477C2.96413 13.743 2.64755 13.743 2.45228 13.5477C2.25702 13.3525 2.25702 13.0359 2.45228 12.8406L5.754 9.53867L2.5 9.53895C2.24687 9.53895 2.03767 9.35085 2.00456 9.1068L2 9.03895C2 8.76281 2.22386 8.53895 2.5 8.53895L5.96105 8.53895ZM9.03895 2C9.31509 2 9.53895 2.22386 9.53895 2.5L9.53867 5.754L12.8406 2.45228C13.0359 2.25702 13.3525 2.25702 13.5477 2.45228C13.743 2.64755 13.743 2.96413 13.5477 3.15939L10.2453 6.46067L13.5 6.46105C13.7531 6.46105 13.9623 6.64915 13.9954 6.8932L14 6.96105C14 7.23719 13.7761 7.46105 13.5 7.46105L10.0389 7.46105C9.21052 7.46105 8.53895 6.78948 8.53895 5.96105L8.53895 2.5C8.53895 2.22386 8.76281 2 9.03895 2Z"
                    />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <title>全屏预览</title>
                    <path
                      fill="currentColor"
                      fillRule="nonzero"
                      d="M2.5 8.53895C2.77614 8.53895 3 8.76281 3 9.03895L3 12.292L6.30166 8.99123C6.49692 8.79597 6.8135 8.79597 7.00877 8.99123C7.20403 9.1865 7.20403 9.50308 7.00877 9.69834L3.70667 13L6.96105 13C7.21418 13 7.42338 13.1881 7.45649 13.4322L7.46105 13.5C7.46105 13.7761 7.23719 14 6.96105 14L3.5 14C2.67157 14 2 13.3284 2 12.5L2 9.03895C2 8.76281 2.22386 8.53895 2.5 8.53895ZM12.5 2C13.3284 2 14 2.67157 14 3.5L14 6.96105C14 7.23719 13.7761 7.46105 13.5 7.46105C13.2239 7.46105 13 7.23719 13 6.96105L13 3.70667L9.69834 7.00877C9.50308 7.20403 9.1865 7.20403 8.99123 7.00877C8.79597 6.8135 8.79597 6.49692 8.99123 6.30166L12.2927 2.99933L9.03895 3C8.78582 3 8.57662 2.8119 8.54351 2.56785L8.53895 2.5C8.53895 2.22386 8.76281 2 9.03895 2L12.5 2Z"
                    />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[#F5F5F7]"
                title="关闭预览"
                aria-label="关闭预览"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <title>关闭</title>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      {children}
    </section>
  );
}
