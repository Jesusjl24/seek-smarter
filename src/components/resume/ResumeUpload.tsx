import { useState, useRef } from "react";
import { Upload, FileText, RefreshCw, Check, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { saveResumeProfile, uploadResumeFile, deleteResumeProfile } from "@/lib/api/resume";
import { ResumeViewModal } from "./ResumeViewModal";
import type { ResumeProfile } from "@/types/job";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ResumeUploadProps {
  profile: ResumeProfile | null;
  onProfileUpdate: (profile: ResumeProfile | null) => void;
}

export function ResumeUpload({ profile, onProfileUpdate }: ResumeUploadProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
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
      // Step 1: Upload file to Supabase Storage
      const { url: fileUrl } = await uploadResumeFile(file);
      
      // Step 2: Convert file to base64 for AI parsing
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // Remove data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Step 3: Call edge function to parse resume
      const { data, error } = await supabase.functions.invoke("parse-resume", {
        body: {
          fileContent: base64,
          fileName: file.name,
          fileType: file.type,
        },
      });

      if (error) throw error;

      // Step 4: Save parsed profile with file URL to database
      const savedProfile = await saveResumeProfile({
        ...data,
        file_url: fileUrl,
        file_name: file.name,
        file_type: file.type,
      });
      
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

  const handleRemoveResume = async () => {
    if (!profile) return;
    
    setIsDeleting(true);
    try {
      await deleteResumeProfile(profile.id);
      onProfileUpdate(null);
      toast({
        title: "Resume removed",
        description: "Your resume has been deleted.",
      });
    } catch (error) {
      console.error("Error removing resume:", error);
      toast({
        title: "Remove failed",
        description: "Failed to remove resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Resume
            </span>
            {profile && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Resume?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete your uploaded resume and all parsed data.
                      You can upload a new resume at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemoveResume}>
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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
              {profile.file_name && (
                <p className="text-xs text-muted-foreground truncate">
                  {profile.file_name}
                </p>
              )}
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

          <div className="flex flex-col gap-2">
            {profile && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowViewModal(true)}
              >
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
            )}
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
                  {profile ? "Upload New" : "Upload"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResumeViewModal
        profile={profile}
        open={showViewModal}
        onClose={() => setShowViewModal(false)}
      />
    </>
  );
}
