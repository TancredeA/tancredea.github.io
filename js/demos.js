/* Live demos. Each demo exposes:
     preview(canvas) -> step()   a self-running thumbnail, one frame per call (optional)
     mount(element, opts)        the full interactive version on the project page */
(function () {
  'use strict';

  // ======================================================================
  // PIPELINE_3D: the full demo lives in demo/. Previews use a recorded run (a video
  // set in site.json); the live version is mounted on the project's simulation page.
  // ======================================================================
  const path = {
    // The full version is the standalone demo in demo/, embedded in an iframe. It posts its
    // height, so the frame fits its content at any width; the page grid is relaid out after.
    mount(root, opts) {
      const f = document.createElement('iframe');
      // opens on the map of the recorded run (opts.seed); "new start" then draws random maps
      f.src = 'demo/?theme=light' + (opts && opts.seed ? '&seed=' + encodeURIComponent(opts.seed) : '');
      f.title = 'Blast-aware route planning, interactive demo';
      f.style.cssText = 'display:block;width:100%;height:960px;border:0';
      root.append(f);
      const onMessage = e => {
        if (!f.isConnected) { removeEventListener('message', onMessage); return; }
        if (e.source !== f.contentWindow || !e.data || e.data.type !== 'blast-demo:height') return;
        f.style.height = e.data.height + 'px';
        if (opts && opts.onResize) opts.onResize();
      };
      addEventListener('message', onMessage);
    }
  };

  window.DEMOS = { path };
})();
