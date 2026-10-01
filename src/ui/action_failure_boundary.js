(function attachActionFailureBoundary(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  function create(options = {}) {
    const report = typeof options.reportFailure === 'function' ? options.reportFailure : () => {};
    function wrap(actionName, action) {
      return (...args) => {
        let result;
        try {
          result = action(...args);
        } catch (error) {
          report({ actionName, error, phase: 'sync' });
          throw error;
        }
        if (result && typeof result.then === 'function') {
          return result.catch(error => {
            report({ actionName, error, phase: 'async' });
            throw error;
          });
        }
        return result;
      };
    }
    return Object.freeze({ wrap });
  }

  SGRA.UI.ActionFailureBoundary = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
