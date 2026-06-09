import { describe, expect, it } from "vitest";
import {
  isExtractableFile,
  isExtractableInvoicePath,
  isImageFile,
  isPdfFile,
} from "@/lib/invoice-extraction-input";
import { computePdfRenderScale } from "@/lib/pdf-to-invoice-image";

describe("invoice extraction input helpers", () => {
  it("detects image files by mime type", () => {
    expect(isImageFile({ type: "image/png", name: "scan.png" })).toBe(true);
    expect(isImageFile({ type: "application/pdf", name: "scan.png" })).toBe(false);
  });

  it("detects pdf files by mime type or extension", () => {
    expect(isPdfFile({ type: "application/pdf", name: "invoice.pdf" })).toBe(true);
    expect(isPdfFile({ type: "", name: "Aviludo_Historico.pdf" })).toBe(true);
    expect(isPdfFile({ type: "image/png", name: "scan.png" })).toBe(false);
  });

  it("marks image and pdf files as extractable", () => {
    expect(isExtractableFile({ type: "image/jpeg", name: "a.jpg" })).toBe(true);
    expect(isExtractableFile({ type: "application/pdf", name: "a.pdf" })).toBe(true);
    expect(isExtractableFile({ type: "text/plain", name: "a.txt" })).toBe(false);
  });

  it("detects extractable invoice storage paths", () => {
    expect(isExtractableInvoicePath("user/123-invoice.pdf")).toBe(true);
    expect(isExtractableInvoicePath("user/123-scan.PNG")).toBe(true);
    expect(isExtractableInvoicePath("user/123-doc.txt")).toBe(false);
    expect(isExtractableInvoicePath(null)).toBe(false);
  });
});

describe("computePdfRenderScale", () => {
  it("keeps scale at 1 for A4-sized pages within max long edge", () => {
    expect(computePdfRenderScale(595, 841, 1600)).toBe(1);
  });

  it("caps scale at 1 when page already fits max long edge", () => {
    expect(computePdfRenderScale(400, 600, 1600)).toBe(1);
    expect(computePdfRenderScale(595, 841, 1600)).toBe(1);
  });

  it("scales down when page exceeds max long edge", () => {
    expect(computePdfRenderScale(2000, 3000, 1600)).toBeCloseTo(1600 / 3000, 5);
  });
});
