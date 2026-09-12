const KEY = 'lighthouse-seo-reports-v1';
export function getHistory() {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value.filter(r => r?.schemaVersion === 1 && r?.input && (r?.target?.page || (r.mode==='domain'&&Array.isArray(r?.target?.pages))) && r?.target?.score) : []; } catch { return []; }
}
export function saveReport(report) {
  const records = [report, ...getHistory().filter(r => r.id !== report.id)].slice(0, 10);
  // Evict older reports on quota errors, never silently discard the current report.
  while (records.length) {
    try { localStorage.setItem(KEY, JSON.stringify(records)); return { saved: true, count: records.length }; }
    catch { records.pop(); }
  }
  return { saved: false, count: getHistory().length };
}
export function deleteReport(id) { localStorage.setItem(KEY, JSON.stringify(getHistory().filter(r => r.id !== id))); localStorage.removeItem(`lighthouse-actions-${id}`); }
export function getChecked(id) { try { const value = JSON.parse(localStorage.getItem(`lighthouse-actions-${id}`) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
export function setChecked(id, checked) { localStorage.setItem(`lighthouse-actions-${id}`, JSON.stringify(checked)); }
