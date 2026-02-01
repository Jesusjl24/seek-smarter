import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, Maximize } from "lucide-react";

// Set up the worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PDFViewerProps {
  fileUrl: string;
  fileName?: string;
}

export function PDFViewer({ fileUrl, fileName }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [scale, setScale] = useState<number>(1.0);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("PDF load error:", error);
    setError(error);
    setIsLoading(false);
  };

  const goToPrevPage = () => setPageNumber((p) => Math.max(1, p - 1));
  const goToNextPage = () => setPageNumber((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(2.0, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));
  const resetZoom = () => setScale(1.0);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 border rounded-lg bg-muted/50">
        <p className="text-destructive font-medium">Failed to load PDF</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          The PDF could not be displayed. Please download the file to view it.
        </p>
        <Button asChild>
          <a href={fileUrl} download={fileName || "resume.pdf"}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-muted">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[80px] text-center">
            {isLoading ? "..." : `${pageNumber} / ${numPages}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages || isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomOut}
            disabled={scale <= 0.5 || isLoading}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={resetZoom}
            disabled={isLoading}
          >
            {Math.round(scale * 100)}%
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomIn}
            disabled={scale >= 2.0 || isLoading}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex justify-center overflow-auto p-4 max-h-[50vh] bg-muted/50">
        {isLoading && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Skeleton className="h-[400px] w-[300px]" />
            <p className="text-sm text-muted-foreground">Loading PDF...</p>
          </div>
        )}
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
          className={isLoading ? "hidden" : ""}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg"
          />
        </Document>
      </div>
    </div>
  );
}
