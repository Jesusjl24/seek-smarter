import { useState, useRef } from "react";
import { Upload, FileText, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { saveResumeProfile } from "@/lib/api/resume";
import type { ResumeProfile } from "@/types/job";
import { formatDistanceToNow } from "date-fns";

interface ResumeUploadProps {
  profile: ResumeProfile | null;
  onProfileUpdate: (profile: ResumeProfile) => void;
}

export function ResumeUpload({ profile, onProfileUpdate }: ResumeUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, DOCX, or TXT file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // Remove data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Call edge function to parse resume
      const { data, error } = await supabase.functions.invoke("parse-resume", {
        body: {
          fileContent: base64,
          fileName: file.name,
          fileType: file.type,
        },
      });

      if (error) throw error;

      // Save parsed profile to database
      const savedProfile = await saveResumeProfile(data);
      onProfileUpdate(savedProfile);

      toast({
        title: "Resume uploaded",
        description: "Your resume has been parsed and saved successfully.",
      });
    } catch (error) {
      console.error("Error uploading resume:", error);
      toast({
        title: "Upload failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to upload and parse resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Resume
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">
                Updated{" "}
                {formatDistanceToNow(new Date(profile.updated_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
            {profile.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {profile.summary}
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {profile.skills_technical.slice(0, 3).map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {profile.skills_technical.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{profile.skills_technical.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No resume uploaded</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />

        <Button
          variant={profile ? "outline" : "default"}
          size="sm"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Parsing...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              {profile ? "Upload New" : "Upload Resume"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
