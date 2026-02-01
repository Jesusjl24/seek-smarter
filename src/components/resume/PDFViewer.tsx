import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";

// Import styles for react-pdf
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up the worker - use .mjs extension for pdfjs-dist v4+
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

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
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch the PDF as a blob to bypass CORS restrictions
  useEffect(() => {
    const fetchPdf = async () => {
      try {
        setIsLoading(true);
        setFetchError(null);
        setError(null);
        setPdfData(null);

        // Fetch the PDF as a blob
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }

        const blob = await response.blob();

        // Convert blob to data URL for react-pdf
        const reader = new FileReader();
        reader.onloadend = () => {
          setPdfData(reader.result as string);
        };
        reader.onerror = () => {
          setFetchError("Failed to read PDF file");
          setIsLoading(false);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error("Error fetching PDF:", err);
        setFetchError(err instanceof Error ? err.message : "Failed to fetch PDF");
        setIsLoading(false);
      }
    };

    if (fileUrl) {
      fetchPdf();
    }
  }, [fileUrl]);

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

  if (error || fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 border rounded-lg bg-muted/50">
        <p className="text-destructive font-medium">Failed to load PDF</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {fetchError || "The PDF could not be displayed."} Please download the file to view it.
        </p>
        <Button asChild>
          <a href={fileUrl} download={fileName || "resume.pdf"} target="_blank" rel="noopener noreferrer">
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
        {pdfData && (
          <Document
            file={pdfData}
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
        )}
      </div>
    </div>
  );
}
