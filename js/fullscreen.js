/**
 * ModusPractica Pro
 * 
 * Copyright (C) 2026 Frank De Baere. All rights reserved.
 * 
 * This program is dual-licensed:
 * 1. Open Source: You can redistribute it and/or modify it under the terms of 
 *    the GNU General Public License as published by the Free Software Foundation, 
 *    either version 3 of the License, or (at your option) any later version.
 * 
 * 2. Commercial: Use, modification, or distribution of this software for 
 *    commercial purposes or integration into proprietary systems is strictly 
 *    prohibited without a prior written commercial license agreement from the author.
 * 
 * For commercial licensing inquiries, please contact: info@parturamusic.be
 */
(function () {
  const ICON_ENTER = '⛶';
  const ICON_EXIT  = '✕';

  function createFsBtn() {
    const btn = document.createElement('button');
    btn.id        = 'mp-fs-btn';
    btn.className = 'mp-fs-btn';
    btn.title     = 'Toggle fullscreen';
    btn.textContent = ICON_ENTER;
    btn.addEventListener('click', toggleFs);
    document.body.appendChild(btn);
    return btn;
  }

  function toggleFs() {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function updateIcon() {
    const btn = document.getElementById('mp-fs-btn');
    if (!btn) return;
    btn.textContent = document.fullscreenElement
      ? ICON_EXIT
      : ICON_ENTER;
    btn.title = document.fullscreenElement
      ? 'Exit fullscreen'
      : 'Enter fullscreen';
  }

  document.addEventListener(
    'fullscreenchange', updateIcon
  );

  if (document.addEventListener) {
    document.addEventListener(
      'DOMContentLoaded', createFsBtn
    );
  }
})();
