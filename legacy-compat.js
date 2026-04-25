(function initLegacyCompat(global) {
  const LEGACY_RESOURCE_KEYS = Object.freeze([
    'resource',
    'resourceKey',
    'table',
    'entity',
    'sheetName',
    'sheet_name',
    'tabName',
    'tab_name'
  ]);

  const LEGACY_REQUEST_META_FIELDS = Object.freeze([
    'backendToken',
    'backendUrl',
    'table',
    'entity',
    'sheetName',
    'sheet_name',
    'tabName',
    'tab_name'
  ]);

  function firstDefinedValue(source = {}, keys = []) {
    for (const key of keys) {
      if (source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
        return source[key];
      }
    }
    return '';
  }

  function resolveResourceName(resourceValue = '', helperFields = {}) {
    const helper = helperFields && typeof helperFields === 'object' ? helperFields : {};
    return String(resourceValue || firstDefinedValue(helper, LEGACY_RESOURCE_KEYS) || '')
      .trim()
      .toLowerCase();
  }

  global.LegacyCompat = Object.freeze({
    LEGACY_RESOURCE_KEYS,
    LEGACY_REQUEST_META_FIELDS,
    resolveResourceName
  });
})(window);
