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
