(function () {
  "use strict";

  if (globalThis.__zearoMessageListener) {
    chrome.runtime.onMessage.removeListener(globalThis.__zearoMessageListener);
  }

  globalThis.__zearoMessageListener = (message, _sender, sendResponse) => {
    if (message.type !== "READ_PROBLEM") {
      return false;
    }

    try {
      sendResponse({
        ok: true,
        problem: ZearoCore.readProblem(document, location.pathname, location.hostname)
      });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  };

  chrome.runtime.onMessage.addListener(globalThis.__zearoMessageListener);
})();
