import {
  sqliteTable,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = () => sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now()),
});

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  baseUrl: text("base_url").notNull(),
  label: text("label").notNull(),
  isCompetitor: integer("is_competitor", { mode: "boolean" }).notNull().default(false),
  competitorOfSiteId: text("competitor_of_site_id"),
  isLocalBusiness: integer("is_local_business", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now()),
});

// Permission-to-audit record. One row per confirmation; an audit cannot be
// created without a matching, unexpired confirmation for its site.
export const permissionConfirmations = sqliteTable("permission_confirmations", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  confirmedBy: text("confirmed_by").notNull(),
  statement: text("statement").notNull(),
  confirmedAt: text("confirmed_at").notNull().default(now()),
});

export const audits = sqliteTable("audits", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  permissionConfirmationId: text("permission_confirmation_id").notNull(),
  status: text("status", {
    enum: ["pending", "crawling", "auditing", "scoring", "done", "failed"],
  })
    .notNull()
    .default("pending"),
  error: text("error"),
  config: text("config", { mode: "json" }).$type<AuditConfig>().notNull(),
  lighthouseVersion: text("lighthouse_version"),
  axeCoreVersion: text("axe_core_version"),
  pa11yVersion: text("pa11y_version"),
  overallScore: real("overall_score"),
  performanceScore: real("performance_score"),
  seoScore: real("seo_score"),
  accessibilityScore: real("accessibility_score"),
  securityScore: real("security_score"),
  startedAt: text("started_at").notNull().default(now()),
  finishedAt: text("finished_at"),
});

export type AuditConfig = {
  maxPages: number;
  lighthouseRuns: number;
  devices: Array<"mobile" | "desktop">;
  concurrency: number;
  checkExposedFiles: boolean;
};

export const auditPages = sqliteTable("audit_pages", {
  id: text("id").primaryKey(),
  auditId: text("audit_id").notNull(),
  url: text("url").notNull(),
  pageType: text("page_type", {
    enum: ["home", "listing", "detail", "form", "contact", "content", "other"],
  }).notNull(),
  device: text("device", { enum: ["mobile", "desktop"] }).notNull(),
  loadOk: integer("load_ok", { mode: "boolean" }).notNull().default(true),
  loadError: text("load_error"),
  httpStatus: integer("http_status"),
  screenshotPath: text("screenshot_path"),
  lighthouseJsonPath: text("lighthouse_json_path"),
  axeJsonPath: text("axe_json_path"),
  pa11yJsonPath: text("pa11y_json_path"),
  metrics: text("metrics", { mode: "json" }).$type<PageMetrics>(),
  headers: text("headers", { mode: "json" }).$type<Record<string, string>>(),
  tls: text("tls", { mode: "json" }).$type<TlsInfo | null>(),
  crux: text("crux", { mode: "json" }).$type<CruxSummary | null>(),
  createdAt: text("created_at").notNull().default(now()),
});

export type PageMetrics = {
  lab: {
    lighthousePerformanceScore: number | null;
    lighthouseSeoScore: number | null;
    lighthouseBestPracticesScore: number | null;
    lcpMs: number | null;
    clsScore: number | null;
    tbtMs: number | null; // lab proxy for INP, must be labelled as such
    fcpMs: number | null;
    speedIndex: number | null;
    ttfbMs: number | null;
    lcpElement: string | null;
    runsUsed: number;
  };
};

export type TlsInfo = {
  valid: boolean;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysUntilExpiry: number | null;
  protocol: string | null;
  cipher: string | null;
  httpsRedirect: boolean | null;
  error: string | null;
};

export type CruxSummary = {
  scope: "page" | "origin";
  hasData: boolean;
  metrics?: Record<string, { p75: number; category: "good" | "needs-improvement" | "poor" }>;
  collectionPeriod?: { firstDate: string; lastDate: string };
};

export const findings = sqliteTable("findings", {
  id: text("id").primaryKey(),
  auditId: text("audit_id").notNull(),
  groupKey: text("group_key").notNull(),
  category: text("category", {
    enum: ["performance", "seo", "accessibility", "security", "content"],
  }).notNull(),
  engine: text("engine").notNull(),
  title: text("title").notNull(),
  explanation: text("explanation").notNull(),
  businessImpact: text("business_impact").notNull(),
  severity: text("severity", { enum: ["critical", "high", "medium", "low", "info"] }).notNull(),
  effort: text("effort", { enum: ["low", "medium", "high"] }).notNull(),
  impact: text("impact", { enum: ["low", "medium", "high"] }).notNull(),
  wcagCriteria: text("wcag_criteria", { mode: "json" }).$type<string[]>().default([]),
  evidence: text("evidence", { mode: "json" }).$type<FindingEvidence[]>().notNull(),
  fixSuggestion: text("fix_suggestion").notNull(),
  affectedPageIds: text("affected_page_ids", { mode: "json" }).$type<string[]>().notNull(),
  status: text("status", { enum: ["open", "fixed", "ignored"] }).notNull().default("open"),
  note: text("note"),
  aiRewritten: integer("ai_rewritten", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now()),
});

export type FindingEvidence = {
  pageUrl: string;
  selector?: string;
  snippet?: string;
  value?: string;
};

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  frequency: text("frequency", { enum: ["weekly", "monthly"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  alertOnScoreDropPoints: real("alert_on_score_drop_points").notNull().default(5),
  alertOnCertExpiryDays: integer("alert_on_cert_expiry_days").notNull().default(14),
  nextRunAt: text("next_run_at").notNull(),
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").notNull().default(now()),
});

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  auditId: text("audit_id"),
  severity: text("severity", { enum: ["warning", "critical"] }).notNull(),
  message: text("message").notNull(),
  acknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now()),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
});
