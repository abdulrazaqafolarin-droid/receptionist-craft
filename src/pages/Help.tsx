import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpCircle, Video, FileText } from "lucide-react";

export default function Help() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">Help & Tutorials</h1>

        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Video className="h-12 w-12 text-primary mb-4" />
              <CardTitle>Video Tutorial</CardTitle>
              <CardDescription>Watch a guided tour of how to set up your AI receptionist</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">Watch Now</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <FileText className="h-12 w-12 text-primary mb-4" />
              <CardTitle>Documentation</CardTitle>
              <CardDescription>Read detailed guides and best practices</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">Read Docs</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <HelpCircle className="h-12 w-12 text-primary mb-4" />
              <CardTitle>FAQ</CardTitle>
              <CardDescription>Find answers to common questions</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">View FAQ</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
