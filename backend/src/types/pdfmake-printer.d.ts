/**
 * Minimal typing for pdfmake's Node server entry (`pdfmake/js/Printer`),
 * which @types/pdfmake does not cover (it only types the browser bundle).
 * Used by billing/pdf.service.ts (spec etapa-5 §3).
 *
 * The specifier must keep the exact on-disk case (`Printer.js`, capital P):
 * macOS resolves either case, but Linux (CI, containers, production) does
 * not, and the runtime require fails with "Cannot find module" (jest e2e
 * on ubuntu-latest, 18/10/2026).
 */
declare module 'pdfmake/js/Printer' {
  import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

  /** Subset of the pdfkit document API used to render to a buffer. */
  export interface PdfDocument {
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    end(): void;
  }

  /** Resolves font/image URLs; local file paths pass through unchanged. */
  export interface UrlResolver {
    resolve(url: string, headers?: Record<string, string>): void;
    resolved(): void | Promise<void>;
  }

  export default class PdfPrinter {
    constructor(
      fonts: TFontDictionary,
      virtualfs?: unknown,
      urlResolver?: UrlResolver,
      localAccessPolicy?: (path: string) => boolean,
    );
    createPdfKitDocument(
      docDefinition: TDocumentDefinitions,
      options?: Record<string, unknown>,
    ): Promise<PdfDocument>;
  }
}
