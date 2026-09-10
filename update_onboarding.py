import re

with open('src/pages/Onboarding.tsx', 'r') as f:
    content = f.read()

# Replace the return statement with new design
old_return = """return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-2xl py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Welcome to FrontDesk
          </div>
        </div>

        {step === "intro" ? (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="text-2xl">Tell us about you and your business</CardTitle>
              <CardDescription>
                Just a few quick details — this is a greeting, not an intake form.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Sarah"
                  value={details.name}
                  onChange={(e) => setDetails({ ...details, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  placeholder="e.g., Sunshine Dental Clinic"
                  value={details.businessName}
                  onChange={(e) => setDetails({ ...details, businessName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessType">Business type</Label>
                <Input
                  id="businessType"
                  placeholder="e.g., a dental clinic, a hair salon, a gym"
                  value={details.businessType}
                  onChange={(e) => setDetails({ ...details, businessType: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">Describe it in your own words</p>
              </div>

              <Button onClick={handleSaveDetails} disabled={saving} className="w-full" size="lg">
                {saving ? "Saving..." : "Continue"}
                {!saving && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="text-2xl">How would you like to set up your AI operator?</CardTitle>
              <CardDescription>
                Both paths build the same thing — choose whichever feels natural to you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                onClick={goConversational}
                className="w-full text-left rounded-xl border-2 border-primary bg-primary/5 p-6 transition-all hover:shadow-lg cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <MessageSquareText className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold text-lg">Build by talking it through</div>
                    <div className="text-xs font-medium text-primary">Recommended — fastest to a setup</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Just describe your business in plain language and we'll design your whole operator for you. You review it, then it's live.
                </p>
              </button>

              <button
                onClick={goForm}
                className="w-full text-left rounded-xl border-2 border-border p-6 transition-all hover:border-primary/50 hover:shadow cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <ListChecks className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-lg">Build with a step-by-step form</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Prefer to fill everything in yourself? Work through the guided wizard at your own pace.
                </p>
              </button>

              <Button variant="outline" onClick={() => setStep("intro")} className="w-full" size="lg">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );"""

new_return = """return (
    <div className="relative min-h-screen bg-background">
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Welcome to Rutex
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold font-display mb-2">Welcome to Rutex</h1>
          <p className="text-muted-foreground text-base sm:text-lg">Your AI operator platform</p>
        </div>

        {step === "intro" ? (
          <Card className="liquid-glass animate-fade-in">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="text-center mb-8">
                <div className="h-16 w-16 rounded-2xl bg-gradient_to_br from-primary to-secondary flex items-center justify-center mx-auto mb-4 shadow-[var(--shadow-glow)]">
                  <Sparkles className="h-8 w-8 text-primary-foreground" aria-hidden="true" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold font-display mb-2">Tell us about you and your business</h2>
                <p className="text-muted-foreground text-base sm:text-lg">Just a few quick details — this is a greeting, not an intake form.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Sarah"
                    value={details.name}
                    onChange={(e) => setDetails({ ...details, name: e.target.value })}
                    className="h-11"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessName">Business name</Label>
                  <Input
                    id="businessName"
                    placeholder="e.g., Sunshine Dental Clinic"
                    value={details.businessName}
                    onChange={(e) => setDetails({ ...details, businessName: e.target.value })}
                    className="h-11"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessType">Business type</Label>
                  <Input
                    id="businessType"
                    placeholder="e.g., a dental clinic, a hair salon, a gym"
                    value={details.businessType}
                    onChange={(e) => setDetails({ ...details, businessType: e.target.value })}
                    className="h-11"
                    disabled={saving}
                  /
