import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Briefcase, GraduationCap, Award, Building2, Clock, FileText, Download, ExternalLink } from "lucide-react";
import type { ResumeProfile } from "@/types/job";

interface ResumeViewModalProps {
  profile: ResumeProfile | null;
  open: boolean;
  onClose: () => void;
}

export function ResumeViewModal({ profile, open, onClose }: ResumeViewModalProps) {
  const [activeTab, setActiveTab] = useState<string>("preview");

  if (!profile) return null;

  const isPDF = profile.file_type === "application/pdf";
  const hasFile = !!profile.file_url;
  
  // Create proxied URL for PDF preview to bypass CORS
  const getProxiedUrl = (url: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/proxy-storage?url=${encodeURIComponent(url)}`;
  };
  
  const previewUrl = hasFile && isPDF ? getProxiedUrl(profile.file_url!) : profile.file_url;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Your Resume Profile
          </DialogTitle>
          {profile.file_name && (
            <p className="text-sm text-muted-foreground">{profile.file_name}</p>
          )}
        </DialogHeader>

        {hasFile ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="preview">Document Preview</TabsTrigger>
              <TabsTrigger value="parsed">Extracted Data</TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="flex-1 overflow-hidden mt-4">
              <div className="h-full flex flex-col">
                {isPDF ? (
                  <div className="flex-1 border rounded-lg overflow-hidden bg-muted">
                    <iframe
                      src={`${previewUrl}#toolbar=0&navpanes=0`}
                      className="w-full h-[60vh]"
                      title="Resume PDF Preview"
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 border rounded-lg bg-muted/50">
                    <FileText className="h-16 w-16 text-muted-foreground" />
                    <div className="text-center">
                      <p className="font-medium">
                        {profile.file_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          ? "Word Document"
                          : "Text File"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        This file type cannot be previewed inline
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" asChild>
                        <a href={profile.file_url} download={profile.file_name}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </a>
                      </Button>
                      <Button variant="outline" asChild>
                        <a href={profile.file_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in New Tab
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
                
                {isPDF && (
                  <div className="flex justify-end gap-2 mt-3">
                    <Button variant="outline" size="sm" asChild>
                      <a href={profile.file_url} download={profile.file_name}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={profile.file_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Full Size
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="parsed" className="flex-1 overflow-hidden mt-4">
              <ExtractedDataView profile={profile} />
            </TabsContent>
          </Tabs>
        ) : (
          <ExtractedDataView profile={profile} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExtractedDataView({ profile }: { profile: ResumeProfile }) {
  return (
    <ScrollArea className="h-[60vh] pr-4">
      <div className="space-y-5">
        {profile.summary && (
          <div>
            <h3 className="font-semibold mb-2">Summary</h3>
            <p className="text-sm text-muted-foreground">{profile.summary}</p>
          </div>
        )}

        {profile.years_experience && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{profile.years_experience} years of experience</span>
          </div>
        )}

        <Separator />

        {profile.skills_technical.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Technical Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {profile.skills_technical.map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {profile.skills_soft.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Soft Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {profile.skills_soft.map((skill) => (
                <Badge key={skill} variant="outline" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {profile.previous_titles.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <Briefcase className="h-4 w-4" />
              Previous Roles
            </h3>
            <ul className="text-sm space-y-1">
              {profile.previous_titles.map((title, i) => (
                <li key={i} className="text-muted-foreground">• {title}</li>
              ))}
            </ul>
          </div>
        )}

        {profile.industries.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              Industries
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {profile.industries.map((industry) => (
                <Badge key={industry} variant="outline" className="text-xs">
                  {industry}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {profile.education.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4" />
              Education
            </h3>
            <ul className="text-sm space-y-1">
              {profile.education.map((edu, i) => (
                <li key={i} className="text-muted-foreground">• {edu}</li>
              ))}
            </ul>
          </div>
        )}

        {profile.certifications.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5">
              <Award className="h-4 w-4" />
              Certifications
            </h3>
            <ul className="text-sm space-y-1">
              {profile.certifications.map((cert, i) => (
                <li key={i} className="text-muted-foreground">• {cert}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
