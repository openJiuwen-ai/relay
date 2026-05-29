/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * PPT 预览相关「选中」描边：使用浅蓝 `blue-200`（#BFDBFE），比缩略条旧版 #2E7CF6 更轻。
 * 用 **border** 不用 ring：ring 在圆角外圈绘制，易在 `overflow-hidden` 祖先内被裁成「底部缺一块」。
 */
export const PPT_PREVIEW_SELECTED_OUTLINE_CLASS = 'border-2 border-blue-200';
export const PPT_PREVIEW_UNSELECTED_OUTLINE_CLASS = 'border-2 border-transparent';

/**
 * 侧栏 `PptSlideStrip` 内层小预览框：白底，选中时仅换为浅色描边（不换浅蓝底，避免发灰/发蓝团块）
 */
export const PPT_SLIDE_STRIP_INACTIVE_INNER_CLASS = 'bg-white border-2 border-gray-200';
export const PPT_SLIDE_STRIP_ACTIVE_INNER_CLASS = `bg-white ${PPT_PREVIEW_SELECTED_OUTLINE_CLASS}`;
