// This is the actual JavaScript that will be injected into target apps via config-patcher.
// Keep it as plain ES5-compatible JS (no arrow functions, no const/let) so it works in any env.
export const NAV_SYNC_SCRIPT = `
(function() {
  if (window.__vbcNavSyncActive) return;
  window.__vbcNavSyncActive = true;

  function notifyParent(path) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'vbc-nav', path: path }, '*');
    }
  }

  // Hook pushState
  var origPush = history.pushState;
  history.pushState = function() {
    origPush.apply(this, arguments);
    notifyParent(location.pathname + location.search);
  };

  // Hook replaceState
  var origReplace = history.replaceState;
  history.replaceState = function() {
    origReplace.apply(this, arguments);
    notifyParent(location.pathname + location.search);
  };

  // Listen for popstate
  window.addEventListener('popstate', function() {
    notifyParent(location.pathname + location.search);
  });

  // Listen for incoming navigation from comparator
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'vbc-nav' && event.data.path) {
      var currentPath = location.pathname + location.search;
      if (event.data.path !== currentPath) {
        history.pushState(null, '', event.data.path);
        // Trigger a popstate-like re-render for SPA frameworks
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  });

  // Report initial path
  notifyParent(location.pathname + location.search);
})();
`;
