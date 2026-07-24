import { __test__ } from "../src/reportDesigner.js";

const layout = __test__.parseReportLayout({
  header: { height: 60, firstPageOnly: false },
  groupHeader: { height: 28 },
  detail: { height: 24 },
  groupFooter: { height: 20 },
  footer: { height: 24 },
  grouping: { enabled: true, field: "site", sort: "asc" },
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
    },
    {
      id: "gf1",
      section: "groupFooter",
      text: "Count {{_groupCount}}",
      x: 40,
      y: 2,
      width: 200,
      fontSize: 10,
      align: "left",
      bold: false,
      italic: true,
      underline: false,
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
    },
  ],
});

if (!layout) {
  console.error("parseReportLayout failed");
  process.exit(1);
}

const rows = [
  { site: "B", name: "Pump" },
  { site: "A", name: "Valve" },
  { site: "A", name: "Motor" },
  { site: "B", name: "Fan" },
];

const groups = __test__.buildGroups(rows, layout.grouping);
if (groups.length !== 2 || groups[0]?.key !== "A" || groups[0]?.rows.length !== 2) {
  console.error("buildGroups unexpected", groups);
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
    grouping: { enabled: false, field: "", sort: "asc" },
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
    pdfBytes: pdf.length,
  }),
);
