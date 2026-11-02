import fs from 'node:fs';
import path from 'node:path';

/**
 * ReportStore.js — Persistent server-side storage for player moderation reports.
 *
 * Saves reports to disk (atomic write via temp file) so they survive server restarts.
 * If no file is provided (e.g. unit tests), operates in-memory.
 */

export const REPORT_STATUSES = ['Pending', 'Reviewed', 'Resolved'];

export class ReportStore {
  constructor({ file } = {}) {
    this.file = file || null;
    /** @type {Array<object>} */
    this.reports = [];
    if (this.file) this.load();
  }

  /** Load persisted reports from disk (missing file = empty list). */
  load() {
    if (!this.file) return this;
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        this.reports = data.filter((r) => r && typeof r === 'object' && r.id);
      }
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        console.warn(`[ReportStore] Could not read ${this.file}: ${err.message} — starting empty`);
      }
    }
    return this;
  }

  /** Write the reports list to disk atomically. */
  flush() {
    if (!this.file) return false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.reports, null, 2));
      fs.renameSync(tmp, this.file);
      return true;
    } catch (err) {
      console.warn(`[ReportStore] Could not write ${this.file}: ${err.message}`);
      return false;
    }
  }

  /**
   * Add a new player report.
   * @param {object} params
   * @param {string} params.reportedUsername
   * @param {string} [params.reportedPlayerId]
   * @param {string} params.reporterUsername
   * @param {string} [params.reporterPlayerId]
   * @param {string} params.reason
   * @param {string} [params.description]
   * @returns {object} created report
   */
  addReport({
    reportedUsername,
    reportedPlayerId = '',
    reporterUsername,
    reporterPlayerId = '',
    reason,
    description = '',
  }) {
    const report = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      reportedUsername: String(reportedUsername || '').trim(),
      reportedPlayerId: String(reportedPlayerId || '').trim(),
      reporterUsername: String(reporterUsername || '').trim(),
      reporterPlayerId: String(reporterPlayerId || '').trim(),
      reason: String(reason || 'General').trim(),
      description: String(description || '').trim().slice(0, 500),
      status: 'Pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.reports.unshift(report);
    this.flush();
    return report;
  }

  /**
   * Update a report's status ('Pending' | 'Reviewed' | 'Resolved').
   * @param {string} reportId
   * @param {string} newStatus
   * @returns {object|null} updated report or null if not found
   */
  updateStatus(reportId, newStatus) {
    const report = this.reports.find((r) => r.id === reportId);
    if (!report) return null;
    if (!REPORT_STATUSES.includes(newStatus)) return null;
    report.status = newStatus;
    report.updatedAt = Date.now();
    this.flush();
    return report;
  }

  /**
   * Retrieve all reports, latest first.
   * @returns {Array<object>}
   */
  getReports() {
    return [...this.reports];
  }
}

