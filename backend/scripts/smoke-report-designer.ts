import { __test__ } from "../src/reportDesigner.js";

const layout = __test__.parseReportLayout({
  header: { height: 60, firstPageOnly: false },
  groupHeader: { height: 28 },
  detail: { height: 80 },
  groupFooter: { height: 20 },
  footer: { height: 24 },
  grouping: { enabled: true, field: "site", sort: "asc", granularity: "day" },
  filters: [],
  elements: [
    {
      id: "h1",
      section: "header",
      text: "Grouped assets",
      x: 40,
      y: 20,
      width: 400,
      fontSize: 16,
      align: "left",
      bold: true,
      italic: false,
      underline: false,
      kind: "text",
      sourceField: "",
      dateFormat: "",
      height: 16,
    },
    {
      id: "gh1",
      section: "groupHeader",
      text: "Site {{_groupValue}}",
      x: 40,
      y: 6,
      width: 300,
      fontSize: 12,
      align: "left",
      bold: true,
      italic: false,
      underline: false,
      kind: "text",
      sourceField: "",
      dateFormat: "",
      height: 16,
    },
    {
      id: "d1",
      section: "detail",
      text: "{{name}}",
      x: 40,
      y: 4,
      width: 240,
      fontSize: 11,
      align: "left",
      bold: false,
      italic: false,
      underline: false,
      kind: "text",
      sourceField: "",
      dateFormat: "",
      height: 16,
    },
    {
      id: "d2",
      section: "detail",
      text: "{{created}}",
      x: 290,
      y: 4,
      width: 120,
      fontSize: 10,
      align: "left",
      bold: false,
      italic: false,
      underline: false,
      kind: "text",
      sourceField: "",
      dateFormat: "DD.MM.YYYY",
      height: 16,
    },
    {
      id: "d-qr",
      section: "detail",
      text: "QR",
      x: 40,
      y: 24,
      width: 48,
      height: 48,
      fontSize: 10,
      align: "left",
      bold: false,
      italic: false,
      underline: false,
      kind: "qr",
      sourceField: "name",
      dateFormat: "",
    },
    {
      id: "d-bc",
      section: "detail",
      text: "Barcode",
      x: 100,
      y: 28,
      width: 160,
      height: 36,
      fontSize: 10,
      align: "left",
      bold: false,
      italic: false,
      underline: false,
      kind: "barcode",
      sourceField: "name",
      dateFormat: "",
    },
    {
      id: "gf1",
      section: "groupFooter",
      text: "Count {{_groupCount}} / Σ {{_groupSum_qty}} / Ø {{_groupAvg_qty}}",
      x: 40,
      y: 2,
      width: 400,
      fontSize: 10,
      align: "left",
      bold: false,
      italic: true,
      underline: false,
      kind: "text",
      sourceField: "",
      dateFormat: "",
      height: 16,
    },
    {
      id: "f1",
      section: "footer",
      text: "Page {{_pageNumber}}",
      x: 40,
      y: 4,
      width: 160,
      fontSize: 10,
      align: "left",
      bold: false,
      italic: false,
      underline: false,
      kind: "text",
      sourceField: "",
      dateFormat: "",
      height: 16,
    },
  ],
});

if (!layout) {
  console.error("parseReportLayout failed");
  process.exit(1);
}

const qrEl = layout.elements.find((el) => el.id === "d-qr");
const bcEl = layout.elements.find((el) => el.id === "d-bc");
const dateEl = layout.elements.find((el) => el.id === "d2");
if (!qrEl || qrEl.kind !== "qr" || qrEl.sourceField !== "name" || qrEl.height !== 48) {
  console.error("qr element parse unexpected", qrEl);
  process.exit(1);
}
if (!bcEl || bcEl.kind !== "barcode" || bcEl.sourceField !== "name") {
  console.error("barcode element parse unexpected", bcEl);
  process.exit(1);
}
if (!dateEl || dateEl.dateFormat !== "DD.MM.YYYY") {
  console.error("dateFormat parse unexpected", dateEl);
  process.exit(1);
}

const rows = [
  { site: "B", name: "Pump", qty: 2, created: "2024-01-15" },
  { site: "A", name: "Valve", qty: 3, created: "2024-02-10" },
  { site: "A", name: "Motor", qty: 5, created: "2024-02-20" },
  { site: "B", name: "Fan", qty: 1, created: "2024-03-01" },
];

const groups = __test__.buildGroups(rows, layout.grouping);
if (groups.length !== 2 || groups[0]?.key !== "A" || groups[0]?.rows.length !== 2) {
  console.error("buildGroups unexpected", groups);
  process.exit(1);
}

const monthGroups = __test__.buildGroups(rows, {
  enabled: true,
  field: "created",
  sort: "asc",
  granularity: "month",
  dateFormat: "YYYY-MM",
});
if (
  monthGroups.length !== 3 ||
  monthGroups[0]?.key !== "2024-01" ||
  monthGroups[1]?.key !== "2024-02" ||
  monthGroups[1]?.rows.length !== 2
) {
  console.error("month buildGroups unexpected", monthGroups);
  process.exit(1);
}

const customFormatGroups = __test__.buildGroups(rows, {
  enabled: true,
  field: "created",
  sort: "asc",
  granularity: "month",
  dateFormat: "MM/YYYY",
});
if (
  customFormatGroups.length !== 3 ||
  customFormatGroups[0]?.key !== "01/2024" ||
  customFormatGroups[1]?.key !== "02/2024"
) {
  console.error("custom format buildGroups unexpected", customFormatGroups);
  process.exit(1);
}

if (__test__.defaultDateFormat("week") !== "YYYY-WWW") {
  console.error("defaultDateFormat week unexpected");
  process.exit(1);
}

const filtered = __test__.applyFilters(rows, [{ field: "site", op: "eq", value: "A" }]);
if (filtered.length !== 2) {
  console.error("applyFilters unexpected", filtered);
  process.exit(1);
}

const aggs = __test__.buildGroupAggregates(groups[0].rows, rows);
if (aggs._groupSum_qty !== "8" || aggs._groupAvg_qty !== "4") {
  console.error("buildGroupAggregates unexpected", aggs);
  process.exit(1);
}

const pdf = await __test__.renderReportPdf({
  title: "smoke-grouped",
  rows,
  layout,
});

if (!Buffer.isBuffer(pdf) || pdf.length < 500 || pdf.subarray(0, 4).toString() !== "%PDF") {
  console.error("renderReportPdf produced invalid PDF", pdf?.length);
  process.exit(1);
}

const withoutGrouping = __test__.parseRenderPdfBody({
  title: "plain",
  rows,
  layout: {
    ...layout,
    grouping: { enabled: false, field: "", sort: "asc", granularity: "day", dateFormat: "YYYY-MM-DD" },
    filters: [],
  },
});
if (!withoutGrouping) {
  console.error("parseRenderPdfBody failed for non-grouped layout");
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    groups: groups.map((g) => ({ key: g.key, count: g.rows.length })),
    monthGroups: monthGroups.map((g) => ({ key: g.key, count: g.rows.length })),
    customFormatGroups: customFormatGroups.map((g) => ({ key: g.key, count: g.rows.length })),
    filtered: filtered.length,
    aggs,
    pdfBytes: pdf.length,
    kinds: layout.elements.map((el) => el.kind),
  }),
);
