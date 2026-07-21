// src/utils/stakeholderReportGenerator.ts
// Professional stakeholder-based report PDF generator.
// Replaces the flat-text layout with a structured, styled document:
// cover header, per-stakeholder sections, categorized task tables,
// detailed report blocks, embedded image attachments, and page footers.

import jsPDF from 'jspdf';
import { Task, TaskReport, User } from '../types';
import { normalizeStatus, statusLabel } from './taskStatus';

// ---------------------------------------------------------------------------
// Options — controlled by the export modal (what to see / download)
// ---------------------------------------------------------------------------

export interface ReportExportOptions {
  /** Emails of stakeholders to include. Empty array = all stakeholders. */
  stakeholderEmails: string[];
  includeSummaryDashboard: boolean;   // top-level stats overview
  includeActiveTasks: boolean;        // tasks with work in progress + their reports
  includeCompletedTasks: boolean;     // completed tasks
  includeOverdueTasks: boolean;       // past due date, not completed
  includeNotWorkedOn: boolean;        // tasks with zero reports submitted
  includeReports: boolean;            // full report details under each task
  includeAttachments: boolean;        // embed images / list attachment links
  dateFrom?: string;                  // optional report date range filter
  dateTo?: string;
}

export const DEFAULT_EXPORT_OPTIONS: ReportExportOptions = {
  stakeholderEmails: [],
  includeSummaryDashboard: true,
  includeActiveTasks: true,
  includeCompletedTasks: true,
  includeOverdueTasks: true,
  includeNotWorkedOn: true,
  includeReports: true,
  includeAttachments: true,
};

export interface AttachmentInfo {
  url: string;
  name: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Design tokens — tweak these to restyle the whole document
// ---------------------------------------------------------------------------

const COLORS = {
  primary: [30, 58, 95] as const,       // deep navy — headers
  primaryLight: [232, 238, 246] as const,
  accent: [59, 130, 246] as const,      // blue — links, highlights
  text: [30, 41, 59] as const,
  textMuted: [100, 116, 139] as const,
  line: [226, 232, 240] as const,
  white: [255, 255, 255] as const,
  // status colors
  completed: [22, 163, 74] as const,    // green — Closed/Completed
  inProgress: [59, 130, 246] as const,  // blue — In Progress
  onHold: [217, 119, 6] as const,       // amber — On Hold
  dropped: [148, 163, 184] as const,    // slate — Dropped
  overdue: [220, 38, 38] as const,      // red — computed overdue
  notStarted: [148, 163, 184] as const, // slate
  zebra: [248, 250, 252] as const,
};

const PAGE = { margin: 16, headerH: 24, footerH: 12 };
const FONT = { title: 18, h1: 13, h2: 11, body: 9.5, small: 8 };

// ---------------------------------------------------------------------------
// Data shaping
// ---------------------------------------------------------------------------

interface StakeholderData {
  email: string;
  displayName: string;   // compact, human-friendly label
  displayContact: string; // truncated email / group summary
  isGroup: boolean;
  activeTasks: Task[];       // not completed, not overdue, has reports
  completedTasks: Task[];
  overdueTasks: Task[];      // not completed, past due (may have reports)
  notWorkedOn: Task[];       // not completed, not overdue, no reports
  reportsByTask: Map<string, TaskReport[]>;
}

// A task counts as "done" when its status normalizes to Closed
// (covers both stored 'Closed' and legacy 'Reviewed').
function isCompleted(task: Task): boolean {
  return normalizeStatus(task.Status) === 'Closed';
}

// Mirrors the overdue convention already used elsewhere in the app
// (Dashboard.tsx / taskEngine.ts): a task is overdue once its due date
// has passed and it isn't already Closed or Reviewed.
function isOverdue(task: Task): boolean {
  if (!task.DueDate || isCompleted(task)) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return task.DueDate < todayStr;
}

// Turn "priyanshu.mangal" -> "Priyanshu Mangal" for a readable fallback.
function prettifyLocalPart(email: string): string {
  const local = email.split('@')[0] || email;
  return local
    .replace(/\d+$/, '')            // drop trailing digits (e.g. narayan.tiwari1)
    .split(/[._-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email;
}

// Build a compact name + contact line for a stakeholder key, which may be a
// single email or a comma-separated group of assignees.
function formatStakeholder(
  key: string,
  users: User[]
): { displayName: string; displayContact: string; isGroup: boolean } {
  const emails = key.split(',').map(e => e.trim()).filter(Boolean);

  if (emails.length <= 1) {
    const email = emails[0] || key;
    const user = users.find(u => u.Email === email);
    return {
      displayName: user?.FullName || prettifyLocalPart(email),
      displayContact: email,
      isGroup: false,
    };
  }

  // Group task: name after the first assignee, summarize the rest.
  const first = emails[0];
  const firstUser = users.find(u => u.Email === first);
  const firstName = firstUser?.FullName || prettifyLocalPart(first);
  return {
    displayName: `${firstName} + ${emails.length - 1} more`,
    displayContact: `${emails.length} assignees: ${emails.join(', ')}`,
    isGroup: true,
  };
}

export function buildStakeholderData(
  tasks: Task[],
  reports: TaskReport[],
  users: User[],
  options: ReportExportOptions
): StakeholderData[] {
  // Filter reports by date range if requested
  const filteredReports = reports.filter(r => {
    if (options.dateFrom && r.ReportDate < options.dateFrom) return false;
    if (options.dateTo && r.ReportDate > options.dateTo) return false;
    return true;
  });

  // Collect stakeholder emails: either selected ones, or every assignee found
  const allEmails = new Set<string>();
  tasks.forEach(t => t.AssignedToEmail && allEmails.add(t.AssignedToEmail));
  const targetEmails =
    options.stakeholderEmails.length > 0
      ? options.stakeholderEmails
      : Array.from(allEmails);

  return targetEmails
    .map(key => {
      const { displayName, displayContact, isGroup } = formatStakeholder(key, users);
      const theirTasks = tasks.filter(t => t.AssignedToEmail === key);

      const reportsByTask = new Map<string, TaskReport[]>();
      theirTasks.forEach(t => {
        const taskReports = filteredReports.filter(r => r.TaskID === t.TaskID);
        if (taskReports.length > 0) reportsByTask.set(t.TaskID, taskReports);
      });

      // Mutually exclusive buckets — each task lands in exactly one, in
      // priority order: Completed -> Overdue -> Active (has reports) ->
      // Not worked on. This stops a task showing up under two headings.
      const completedTasks: Task[] = [];
      const overdueTasks: Task[] = [];
      const activeTasks: Task[] = [];
      const notWorkedOn: Task[] = [];

      theirTasks.forEach(t => {
        if (isCompleted(t)) completedTasks.push(t);
        else if (isOverdue(t)) overdueTasks.push(t);
        else if (reportsByTask.has(t.TaskID)) activeTasks.push(t);
        else notWorkedOn.push(t);
      });

      return {
        email: key,
        displayName,
        displayContact,
        isGroup,
        activeTasks,
        completedTasks,
        overdueTasks,
        notWorkedOn,
        reportsByTask,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ---------------------------------------------------------------------------
// Low-level drawing helpers
// ---------------------------------------------------------------------------

class PdfWriter {
  doc: jsPDF;
  y: number;
  pageW: number;
  pageH: number;
  contentW: number;
  reportTitle: string;

  constructor(reportTitle: string) {
    this.doc = new jsPDF();
    this.pageW = this.doc.internal.pageSize.getWidth();
    this.pageH = this.doc.internal.pageSize.getHeight();
    this.contentW = this.pageW - PAGE.margin * 2;
    this.y = PAGE.margin;
    this.reportTitle = reportTitle;
  }

  /** Ensure `needed` mm of vertical space, else start a new page. */
  ensure(needed: number) {
    if (this.y + needed > this.pageH - PAGE.footerH - 4) {
      this.doc.addPage();
      this.y = PAGE.margin;
    }
  }

  coverHeader(subtitle: string) {
    const d = this.doc;
    d.setFillColor(...COLORS.primary);
    d.rect(0, 0, this.pageW, 34, 'F');
    d.setTextColor(...COLORS.white);
    d.setFont('helvetica', 'bold');
    d.setFontSize(FONT.title);
    d.text(this.reportTitle, PAGE.margin, 15);
    d.setFont('helvetica', 'normal');
    d.setFontSize(FONT.body);
    d.text(subtitle, PAGE.margin, 23);
    d.setFontSize(FONT.small);
    d.text(`Generated: ${new Date().toLocaleString()}`, PAGE.margin, 29);
    d.setTextColor(...COLORS.text);
    this.y = 42;
  }

  /** Truncate a string to fit a given width at the current font size. */
  fit(text: string, maxW: number): string {
    const d = this.doc;
    if (d.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && d.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  /** Compact stakeholder section header with a colored band. */
  stakeholderHeader(name: string, contact: string, stats: string) {
    this.ensure(16);
    const d = this.doc;
    const bandH = 11;
    d.setFillColor(...COLORS.primaryLight);
    d.roundedRect(PAGE.margin, this.y, this.contentW, bandH, 1.5, 1.5, 'F');

    // stats sit on the right; measure so the name never overlaps them
    d.setFont('helvetica', 'normal');
    d.setFontSize(FONT.small);
    const statsW = d.getTextWidth(stats);
    d.setTextColor(...COLORS.textMuted);
    d.text(stats, this.pageW - PAGE.margin - 4, this.y + 7, { align: 'right' });

    // name (left), sized down and truncated to the space before the stats
    const nameMaxW = this.contentW - statsW - 14;
    d.setFont('helvetica', 'bold');
    d.setFontSize(FONT.h2);
    d.setTextColor(...COLORS.primary);
    d.text(this.fit(name, nameMaxW), PAGE.margin + 4, this.y + 5);

    // contact line, muted + truncated, directly under the name
    d.setFont('helvetica', 'normal');
    d.setFontSize(7);
    d.setTextColor(...COLORS.textMuted);
    d.text(this.fit(contact, nameMaxW), PAGE.margin + 4, this.y + 9);

    d.setTextColor(...COLORS.text);
    this.y += bandH + 3;
  }

  /** Sub-section header, e.g. "Overdue Tasks (3)". */
  sectionHeader(label: string, color: readonly number[]) {
    this.ensure(12);
    const d = this.doc;
    d.setFillColor(color[0], color[1], color[2]);
    d.rect(PAGE.margin, this.y, 2.5, 6, 'F');
    d.setFont('helvetica', 'bold');
    d.setFontSize(FONT.h2);
    d.setTextColor(color[0], color[1], color[2]);
    d.text(label, PAGE.margin + 5, this.y + 4.6);
    d.setTextColor(...COLORS.text);
    this.y += 9;
  }

  /** Table of tasks: Title | Status | Priority | Due Date | Progress. */
  taskTable(tasks: Task[], reportsByTask: Map<string, TaskReport[]>) {
    const d = this.doc;
    const cols = [
      { label: 'Task', w: this.contentW * 0.38 },
      { label: 'Status', w: this.contentW * 0.16 },
      { label: 'Priority', w: this.contentW * 0.13 },
      { label: 'Due Date', w: this.contentW * 0.18 },
      { label: 'Progress', w: this.contentW * 0.15 },
    ];

    // header row
    this.ensure(8);
    d.setFillColor(...COLORS.primary);
    d.rect(PAGE.margin, this.y, this.contentW, 7, 'F');
    d.setFont('helvetica', 'bold');
    d.setFontSize(FONT.small);
    d.setTextColor(...COLORS.white);
    let x = PAGE.margin;
    cols.forEach(c => {
      d.text(c.label, x + 2, this.y + 4.7);
      x += c.w;
    });
    this.y += 7;

    // rows
    d.setFont('helvetica', 'normal');
    tasks.forEach((task, i) => {
      const titleLines = d.splitTextToSize(task.Title || '—', cols[0].w - 4);
      const rowH = Math.max(7, titleLines.length * 4 + 3);
      this.ensure(rowH);

      if (i % 2 === 1) {
        d.setFillColor(...COLORS.zebra);
        d.rect(PAGE.margin, this.y, this.contentW, rowH, 'F');
      }

      const latest = reportsByTask.get(task.TaskID)?.slice(-1)[0];
      const progress =
        isCompleted(task) ? '100%'
        : latest ? `${latest.PercentComplete}%`
        : '0%';

      d.setTextColor(...COLORS.text);
      d.setFontSize(FONT.small);
      x = PAGE.margin;
      d.text(titleLines, x + 2, this.y + 4.5);
      x += cols[0].w;

      // status color + label, driven by the four normalized statuses
      const norm = normalizeStatus(task.Status);
      const overdue = isOverdue(task);
      const statusColor =
        norm === 'Closed' ? COLORS.completed
        : overdue ? COLORS.overdue
        : norm === 'In Progress' ? COLORS.inProgress
        : norm === 'On Hold' ? COLORS.onHold
        : COLORS.dropped;
      d.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      d.setFont('helvetica', 'bold');
      const label = statusLabel(task.Status);
      d.text(overdue ? `${label} (Overdue)` : label, x + 2, this.y + 4.5);
      d.setFont('helvetica', 'normal');
      d.setTextColor(...COLORS.text);
      x += cols[1].w;

      d.text(task.Priority || '—', x + 2, this.y + 4.5);
      x += cols[2].w;
      d.text(task.DueDate || '—', x + 2, this.y + 4.5);
      x += cols[3].w;
      d.text(progress, x + 2, this.y + 4.5);

      this.y += rowH;
      d.setDrawColor(...COLORS.line);
      d.line(PAGE.margin, this.y, PAGE.margin + this.contentW, this.y);
    });
    this.y += 4;
  }

  /** A boxed report block under a task. */
  reportBlock(report: TaskReport, index: number) {
    const d = this.doc;
    const innerW = this.contentW - 8;

    const summaryLines = d.splitTextToSize(report.WorkSummary || '—', innerW - 4);
    const blockerLines = report.Blockers ? d.splitTextToSize(report.Blockers, innerW - 4) : [];
    const nextLines = report.NextAction ? d.splitTextToSize(report.NextAction, innerW - 4) : [];
    const estH =
      14 + summaryLines.length * 4 +
      (blockerLines.length ? blockerLines.length * 4 + 6 : 0) +
      (nextLines.length ? nextLines.length * 4 + 6 : 0) + 6;

    this.ensure(Math.min(estH, 80)); // allow tall blocks to flow across pages

    const startY = this.y;
    d.setDrawColor(...COLORS.line);
    d.setFillColor(252, 253, 255);

    // meta line
    d.setFont('helvetica', 'bold');
    d.setFontSize(FONT.small);
    d.setTextColor(...COLORS.primary);
    d.text(`Report ${index + 1}`, PAGE.margin + 4, this.y + 5);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...COLORS.textMuted);
    d.text(
      `${report.ReportDate}  ·  ${report.SubmittedByEmail}  ·  ${report.StatusUpdate}  ·  ${report.PercentComplete}% complete`,
      PAGE.margin + 24, this.y + 5
    );
    this.y += 9;

    const labeled = (label: string, lines: string[], color: readonly number[]) => {
      if (!lines.length) return;
      this.ensure(lines.length * 4 + 6);
      d.setFont('helvetica', 'bold');
      d.setTextColor(color[0], color[1], color[2]);
      d.text(label, PAGE.margin + 4, this.y + 4);
      this.y += 5;
      d.setFont('helvetica', 'normal');
      d.setTextColor(...COLORS.text);
      d.text(lines, PAGE.margin + 4, this.y + 3.5);
      this.y += lines.length * 4 + 2;
    };

    labeled('Work Summary', summaryLines, COLORS.primary);
    labeled('Blockers', blockerLines, COLORS.overdue);
    labeled('Next Action', nextLines, COLORS.inProgress);

    // left rule marking the block
    d.setDrawColor(...COLORS.accent);
    d.setLineWidth(0.8);
    d.line(PAGE.margin + 1, startY + 2, PAGE.margin + 1, this.y);
    d.setLineWidth(0.2);
    this.y += 4;
  }

  async attachmentList(attachments: AttachmentInfo[]) {
    const d = this.doc;
    for (const att of attachments) {
      if (att.type.startsWith('image/')) {
        try {
          const imgData = await fetchImageAsBase64(att.url);
          const imgW = 60, imgH = 45;
          this.ensure(imgH + 10);
          d.addImage(imgData, 'JPEG', PAGE.margin + 4, this.y, imgW, imgH);
          this.y += imgH + 2;
          d.setFontSize(FONT.small);
          d.setTextColor(...COLORS.textMuted);
          d.text(att.name, PAGE.margin + 4, this.y + 3);
          this.y += 7;
          continue;
        } catch {
          /* fall through to link reference */
        }
      }
      this.ensure(8);
      d.setFontSize(FONT.small);
      d.setTextColor(...COLORS.textMuted);
      d.text(`Attachment: ${att.name} (${att.type})`, PAGE.margin + 4, this.y + 3);
      this.y += 4;
      d.setTextColor(...COLORS.accent);
      d.textWithLink(att.url, PAGE.margin + 4, this.y + 3, { url: att.url });
      d.setTextColor(...COLORS.text);
      this.y += 7;
    }
  }

  emptyNote(text: string) {
    this.ensure(8);
    const d = this.doc;
    d.setFont('helvetica', 'italic');
    d.setFontSize(FONT.small);
    d.setTextColor(...COLORS.textMuted);
    d.text(text, PAGE.margin + 4, this.y + 3.5);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...COLORS.text);
    this.y += 8;
  }

  /** Closing remark recorded when a task was closed, shown under Completed. */
  closeRemark(task: Task) {
    const remark = (task.CloseRemark || '').trim();
    if (!remark) return;
    const d = this.doc;
    const innerW = this.contentW - 8;
    const titleLines = d.splitTextToSize(`Closing remark — ${task.Title}`, innerW - 4);
    const remarkLines = d.splitTextToSize(remark, innerW - 4);

    this.ensure(Math.min(titleLines.length * 4 + remarkLines.length * 4 + 8, 60));
    const startY = this.y;

    // heading (task title) + optional completion date
    d.setFont('helvetica', 'bold');
    d.setFontSize(FONT.small);
    d.setTextColor(...COLORS.completed);
    d.text(titleLines, PAGE.margin + 4, this.y + 4);
    this.y += titleLines.length * 4 + 1;

    if (task.CompletionDate) {
      d.setFont('helvetica', 'normal');
      d.setTextColor(...COLORS.textMuted);
      d.text(`Closed ${task.CompletionDate}`, PAGE.margin + 4, this.y + 3.5);
      this.y += 5;
    }

    // remark body
    d.setFont('helvetica', 'normal');
    d.setTextColor(...COLORS.text);
    d.text(remarkLines, PAGE.margin + 4, this.y + 3.5);
    this.y += remarkLines.length * 4 + 2;

    // green left rule to match the Completed section
    d.setDrawColor(...COLORS.completed);
    d.setLineWidth(0.8);
    d.line(PAGE.margin + 1, startY + 1, PAGE.margin + 1, this.y);
    d.setLineWidth(0.2);
    this.y += 4;
  }

  /** Summary dashboard: overall stats across all included stakeholders. */
  summaryDashboard(data: StakeholderData[]) {
    const totals = data.reduce(
      (acc, s) => {
        acc.stakeholders += 1;
        acc.active += s.activeTasks.length;
        acc.completed += s.completedTasks.length;
        acc.overdue += s.overdueTasks.length;
        acc.notWorkedOn += s.notWorkedOn.length;
        return acc;
      },
      { stakeholders: 0, active: 0, completed: 0, overdue: 0, notWorkedOn: 0 }
    );

    const cards = [
      { label: 'Stakeholders', value: totals.stakeholders, color: COLORS.primary },
      { label: 'Active', value: totals.active, color: COLORS.inProgress },
      { label: 'Completed', value: totals.completed, color: COLORS.completed },
      { label: 'Overdue', value: totals.overdue, color: COLORS.overdue },
      { label: 'Not Worked On', value: totals.notWorkedOn, color: COLORS.notStarted },
    ];

    const d = this.doc;
    const gap = 4;
    const cardW = (this.contentW - gap * (cards.length - 1)) / cards.length;
    this.ensure(26);
    cards.forEach((c, i) => {
      const x = PAGE.margin + i * (cardW + gap);
      d.setFillColor(c.color[0], c.color[1], c.color[2]);
      d.roundedRect(x, this.y, cardW, 20, 2, 2, 'F');
      d.setTextColor(...COLORS.white);
      d.setFont('helvetica', 'bold');
      d.setFontSize(15);
      d.text(String(c.value), x + cardW / 2, this.y + 9, { align: 'center' });
      d.setFont('helvetica', 'normal');
      d.setFontSize(FONT.small);
      d.text(c.label, x + cardW / 2, this.y + 16, { align: 'center' });
    });
    d.setTextColor(...COLORS.text);
    this.y += 27;
  }

  /** Page numbers + footer line on every page — call last. */
  finalizeFooters() {
    const d = this.doc;
    const pages = d.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      d.setPage(i);
      d.setDrawColor(...COLORS.line);
      d.line(PAGE.margin, this.pageH - 10, this.pageW - PAGE.margin, this.pageH - 10);
      d.setFontSize(FONT.small);
      d.setTextColor(...COLORS.textMuted);
      d.text(this.reportTitle, PAGE.margin, this.pageH - 5.5);
      d.text(`Page ${i} of ${pages}`, this.pageW - PAGE.margin, this.pageH - 5.5, { align: 'right' });
    }
  }
}

function getFileTypeFromUrl(url: string): string {
  if (url.includes('.pdf')) return 'application/pdf';
  if (url.includes('.doc') || url.includes('.docx')) return 'application/msword';
  if (url.includes('.xls') || url.includes('.xlsx')) return 'application/vnd.ms-excel';
  if (url.match(/\.(jpg|jpeg|png|gif)$/i)) return 'image/jpeg';
  if (url.includes('.mp4') || url.includes('.mov')) return 'video/mp4';
  return 'application/octet-stream';
}

function extractAttachments(report: TaskReport): AttachmentInfo[] {
  if (!report.AttachmentLink) return [];
  return report.AttachmentLink
    .split(',')
    .map(l => l.trim())
    .filter(Boolean)
    .map((link, idx) => ({
      url: link,
      name: link.split('/').pop() || `attachment-${idx + 1}`,
      type: getFileTypeFromUrl(link),
    }));
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generateStakeholderReport(
  tasks: Task[],
  reports: TaskReport[],
  users: User[],
  options: ReportExportOptions = DEFAULT_EXPORT_OPTIONS,
  title = 'Stakeholder Task & Progress Report'
): Promise<Blob> {
  const data = buildStakeholderData(tasks, reports, users, options);
  const w = new PdfWriter(title);

  const range =
    options.dateFrom || options.dateTo
      ? `Report period: ${options.dateFrom || 'start'} → ${options.dateTo || 'today'}`
      : 'All report dates';
  w.coverHeader(range);

  if (options.includeSummaryDashboard) {
    w.sectionHeader('Overview', COLORS.primary);
    w.summaryDashboard(data);
  }

  for (const s of data) {
    const total =
      s.overdueTasks.length + s.activeTasks.length +
      s.completedTasks.length + s.notWorkedOn.length;
    const stats = `${total} task${total === 1 ? '' : 's'}  ·  ${s.overdueTasks.length} overdue  ·  ${s.completedTasks.length} done`;
    w.stakeholderHeader(s.displayName, s.displayContact, stats);

    if (total === 0) {
      w.emptyNote('No tasks in the selected range.');
      w.y += 2;
      continue;
    }

    // Renders a task's report blocks (+ attachments) beneath a table.
    const renderTaskReports = async (taskList: Task[]) => {
      if (!options.includeReports) return;
      for (const task of taskList) {
        const taskReports = s.reportsByTask.get(task.TaskID) || [];
        if (!taskReports.length) continue;
        w.ensure(10);
        w.doc.setFont('helvetica', 'bold');
        w.doc.setFontSize(FONT.body);
        w.doc.setTextColor(...COLORS.text);
        w.doc.text(w.fit(`Reports — ${task.Title}`, w.contentW - 4), PAGE.margin, w.y + 4);
        w.y += 8;
        for (let i = 0; i < taskReports.length; i++) {
          w.reportBlock(taskReports[i], i);
          if (options.includeAttachments) {
            await w.attachmentList(extractAttachments(taskReports[i]));
          }
        }
      }
    };

    // Only render sections that are enabled AND non-empty.
    if (options.includeOverdueTasks && s.overdueTasks.length) {
      w.sectionHeader(`Overdue Tasks (${s.overdueTasks.length})`, COLORS.overdue);
      w.taskTable(s.overdueTasks, s.reportsByTask);
      await renderTaskReports(s.overdueTasks);
    }

    if (options.includeActiveTasks && s.activeTasks.length) {
      w.sectionHeader(`Active Tasks with Progress (${s.activeTasks.length})`, COLORS.inProgress);
      w.taskTable(s.activeTasks, s.reportsByTask);
      await renderTaskReports(s.activeTasks);
    }

    if (options.includeCompletedTasks && s.completedTasks.length) {
      w.sectionHeader(`Completed Tasks (${s.completedTasks.length})`, COLORS.completed);
      w.taskTable(s.completedTasks, s.reportsByTask);
      // Show the closing remark captured when each task was closed.
      for (const task of s.completedTasks) w.closeRemark(task);
    }

    if (options.includeNotWorkedOn && s.notWorkedOn.length) {
      w.sectionHeader(`Tasks Not Worked On (${s.notWorkedOn.length})`, COLORS.notStarted);
      w.taskTable(s.notWorkedOn, s.reportsByTask);
    }

    w.y += 4;
  }

  w.finalizeFooters();
  return w.doc.output('blob');
}