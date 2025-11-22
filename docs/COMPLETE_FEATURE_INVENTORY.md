# Complete Feature Inventory & Connections
## AI Receptionist Platform - Every Feature Documented

---

# 🔐 AUTHENTICATION SYSTEM

## Landing Page (`/`)
**Location**: First page visitors see when not logged in

### Features:
- **Hero Section** - Introduces the AI Receptionist concept
- **"Get Started" Button** → Redirects to `/auth`
- **Auto-redirect Logic** - If user already logged in → redirects to `/dashboard`

### Purpose:
Marketing and entry point for new users

### Connections:
- **Links to**: Auth page
- **Links from**: No internal links (entry point)
- **Used by**: Unauthenticated visitors

---

## Auth Page (`/auth`)
**Location**: Login/Signup page

### Features:

#### Sign Up Section:
- **Email Input Field** - Collects user email
- **Password Input Field** - Sets account password
- **"Sign Up" Button** - Creates new account
  - **Action**: Calls Supabase Auth API
  - **On Success**: Creates profile in `profiles` table
  - **Redirects to**: `/dashboard`

#### Login Section:
- **Email Input Field** - User enters email
- **Password Input Field** - User enters password
- **"Login" Button** - Authenticates user
  - **Action**: Validates credentials via Supabase
  - **On Success**: Creates session
  - **Redirects to**: `/dashboard`

### Database Impact:
- **Creates**: New record in `auth.users` (Supabase managed)
- **Creates**: New record in `profiles` table via trigger
- **Sets**: Session cookie in browser

### Purpose:
Gateway to entire platform - controls access to all protected features

### Connections:
- **Links from**: Landing page, any protected route (if not authenticated)
- **Links to**: Dashboard (on success)
- **Trigger**: `handle_new_user()` database function creates profile automatically

---

# 🏠 MAIN APPLICATION (Authenticated Users Only)

## Global Layout
**Location**: Wraps all authenticated pages

### Features:

#### Sidebar (Left Panel):
Component: `AppSidebar.tsx`

**Navigation Items**:
1. **Dashboard** icon + text → `/dashboard`
2. **Analytics** icon + text → `/analytics`
3. **Conversations** icon + text → `/conversations`
4. **Appointments** icon + text → `/appointments`
5. **Services** icon + text → `/services`
6. **Availability** icon + text → `/availability`
7. **Quality Review** icon + text → `/quality-review`
8. **KB Suggestions** icon + text → `/kb-rewrite`
9. **Diagnostics** icon + text → `/diagnostics`
10. **Notifications** icon + text → `/notifications`
11. **Realtime Logs** icon + text → `/realtime-logs`
12. **Settings** icon + text → `/settings`
13. **Help** icon + text → `/help`

**Sidebar Behavior**:
- **Collapse Button** (SidebarTrigger) - Collapses sidebar to mini mode (icons only)
- **Mini Mode**: Shows icons only, width 56px
- **Full Mode**: Shows icons + text, width 240px
- **Active Route Highlighting**: Current page highlighted in primary color
- **Persisted State**: Collapse state saved in browser

**Purpose**: Primary navigation for entire app

#### Top Header Bar:
**Left Side**:
- **Sidebar Trigger Button** - Toggle sidebar collapse/expand

**Right Side** (Navbar Component):
- **User Avatar/Email Display** - Shows logged-in user
- **"Logout" Button** - Signs out user
  - **Action**: Clears Supabase session
  - **Redirects to**: `/auth`

### Purpose:
Consistent navigation across entire platform

### Connections:
- **Visible on**: All authenticated routes
- **Links to**: All main features
- **Session Aware**: Shows different content based on auth state

---

# 📊 DASHBOARD PAGE
**Route**: `/dashboard`
**Component**: `Dashboard.tsx`

## Header Section

### Title Area:
- **"Dashboard" Text** - Page title (h1)
- **Description Text** - "Your AI-powered appointment booking system"

### Action Area:
- **"Create Receptionist" Button** → Redirects to `/onboarding`
  - **Icon**: Plus icon
  - **Purpose**: Quick access to create new AI receptionist

## Statistics Cards (3 Cards in Grid)

### Card 1: Total Conversations
**Display**:
- **Number**: Count of all conversations across all receptionists
- **Label**: "Total Conversations"
- **Subtext**: "All time"
- **Icon**: MessageCircle

**Data Source**: 
```sql
SELECT COUNT(*) FROM conversations 
WHERE receptionist_id IN (user's receptionists)
```

**Purpose**: Shows engagement level

### Card 2: Appointments Booked
**Display**:
- **Number**: Total appointments created
- **Label**: "Appointments Booked"
- **Subtext**: "All time"
- **Icon**: Calendar

**Data Source**:
```sql
SELECT COUNT(*) FROM appointments 
WHERE receptionist_id IN (user's receptionists)
```

**Purpose**: Shows booking success rate

### Card 3: Active Receptionists
**Display**:
- **Number**: Count of active AI receptionists
- **Label**: "Active Receptionists"
- **Subtext**: "Ready to handle calls"
- **Icon**: Phone

**Data Source**:
```sql
SELECT COUNT(*) FROM receptionists 
WHERE user_id = current_user AND active = true
```

**Purpose**: Shows account capacity

## Getting Started Guide
**Visibility**: Only shown if user has 0 receptionists

### Steps Displayed:
1. **Step 1**: Create Your AI Receptionist
   - **Icon**: Number badge "1"
   - **Description**: "Set up your receptionist's name, business details, and personality"
   
2. **Step 2**: Add Services
   - **Icon**: Number badge "2"
   - **Description**: "Define the services you offer (haircut, massage, consultation, etc.)"
   
3. **Step 3**: Set Availability
   - **Icon**: Number badge "3"
   - **Description**: "Configure your business hours so the AI knows when to book appointments"
   
4. **Step 4**: Test the AI Chat
   - **Icon**: Number badge "4"
   - **Description**: "Go to Builder and chat with your AI to book test appointments"
   
5. **Step 5**: View in Calendar
   - **Icon**: Number badge "5"
   - **Description**: "Check the Appointments page to see all booked appointments in calendar view"

**Purpose**: Onboards new users step-by-step

## Receptionists List Section

### If No Receptionists:
- **Empty State Icon**: Phone icon (large, muted)
- **Title**: "No receptionists yet"
- **Description**: "Create your first AI receptionist to get started"
- **"Create Your First Receptionist" Button** → `/onboarding`

### If Receptionists Exist:
**Card per Receptionist** containing:

#### Left Side:
- **Avatar Circle** - Gradient background with phone icon
- **Receptionist Name** - Bold text
- **Business Name** - Smaller, muted text

#### Right Side:
- **Status Badge** - "Active" (green) or "Inactive" (gray)
  - **Data**: From `receptionists.active` field
- **Demo Mode Badge** - "Demo Mode" (if `mock_mode = true`)
  - **Color**: Primary with light background
- **"Edit" Button** → `/builder/{receptionist_id}`
  - **Purpose**: Opens builder to configure this receptionist

**Data Source**:
```sql
SELECT * FROM receptionists 
WHERE user_id = current_user 
ORDER BY created_at DESC
```

## Quick Actions Grid (4 Cards)

### Card 1: View Conversations
**Display**:
- **Icon**: MessageCircle (primary color)
- **Title**: "View Conversations"
- **Description**: "See all chat transcripts and interactions"
- **Click**: Navigate to `/conversations`

### Card 2: Appointments Calendar
**Display**:
- **Icon**: Calendar (primary color)
- **Title**: "Appointments Calendar"
- **Description**: "View all AI-booked appointments in calendar"
- **Click**: Navigate to `/appointments`

### Card 3: Analytics Dashboard
**Display**:
- **Icon**: BarChart3 (primary color)
- **Title**: "Analytics Dashboard"
- **Description**: "Comprehensive performance insights"
- **Click**: Navigate to `/analytics`

### Card 4: Quality Review
**Display**:
- **Icon**: CheckCircle2 (primary color)
- **Title**: "Quality Review"
- **Description**: "Review AI responses and improve quality"
- **Click**: Navigate to `/quality-review`

## Setup Quick Actions (Only if receptionists exist)

### Card 1: Manage Services
**Display**:
- **Icon**: Plus
- **Title**: "Manage Services"
- **Description**: "Add and manage the services that customers can book via AI chat"
- **Click**: Navigate to `/services`

### Card 2: Set Business Hours
**Display**:
- **Icon**: Calendar
- **Title**: "Set Business Hours"
- **Description**: "Configure when your AI receptionist can accept bookings"
- **Click**: Navigate to `/availability`

## Purpose & Connections:
**Purpose**: Central hub - shows overview and provides quick navigation

**Connections**:
- **Data from**: `receptionists`, `conversations`, `appointments` tables
- **Links to**: Every major feature in the app
- **Updates when**: User creates receptionist, books appointment, has conversations

---

# 🎓 ONBOARDING PAGE
**Route**: `/onboarding`
**Component**: `Onboarding.tsx`

## Progress Indicator (Top)

### 3-Step Progress Bar:
**Step 1 Circle**: "1" or checkmark
- **Label**: "Basic Info"
- **State**: Active (blue) when on step 1, completed (blue) when past step 1

**Progress Line**: Connects step 1 to 2
- **State**: Gray (incomplete) or blue (completed)

**Step 2 Circle**: "2" or checkmark
- **Label**: "Choose Template"
- **State**: Active or completed based on current step

**Progress Line**: Connects step 2 to 3

**Step 3 Circle**: "3" or checkmark
- **Label**: "Preview & Publish"
- **State**: Active or completed based on current step

## Step 1: Basic Info

### Form Fields:

#### Business Name Input:
- **Label**: "Business Name *"
- **Placeholder**: "e.g., Sunshine Dental Clinic"
- **Required**: Yes
- **Help Text**: "This is how your receptionist will introduce your business"
- **Validation**: Cannot be empty

#### Receptionist Name Input:
- **Label**: "Receptionist Name *"
- **Placeholder**: "e.g., Sarah, Alex, or Maya"
- **Required**: Yes
- **Help Text**: "Give your AI receptionist a friendly name"
- **Validation**: Cannot be empty

#### Tone Selection:
- **Label**: "Preferred Tone"
- **Type**: Radio buttons (3 options)

**Option 1**: Friendly
- **Label**: "Friendly — Warm and welcoming"
- **Value**: `friendly`

**Option 2**: Professional
- **Label**: "Professional — Polished and formal"
- **Value**: `professional`

**Option 3**: Playful
- **Label**: "Playful — Fun and energetic"
- **Value**: `playful`

### Navigation:
- **"Continue" Button** → Advances to Step 2
  - **Icon**: ArrowRight
  - **Validation**: Checks required fields
  - **Error**: Shows toast if fields empty

## Step 2: Choose Template

### Template Cards (4 Templates in Grid):

#### Template 1: Medical Clinic
- **Icon**: 🏥
- **Name**: "Medical Clinic"
- **Click**: Selects this template
- **Visual**: Border turns primary color when selected
- **Includes 3 Pre-configured FAQs**:
  1. "What services do you offer?" → "We offer general consultations, vaccinations, lab tests, and minor procedures."
  2. "What are your hours?" → "We're open Monday to Friday, 8am to 6pm, and Saturday 9am to 2pm."
  3. "How do I book an appointment?" → "You can book by calling us or I can help you book one right now!"

#### Template 2: Hair Salon
- **Icon**: 💇
- **Name**: "Hair Salon"
- **Includes 3 Pre-configured FAQs**:
  1. "What services do you provide?" → "We offer haircuts, coloring, styling, treatments, and extensions."
  2. "Do I need an appointment?" → "We recommend booking ahead, but walk-ins are welcome when available."
  3. "What are your prices?" → "Haircuts start at $45. Would you like to know about specific services?"

#### Template 3: Contractor
- **Icon**: 🔨
- **Name**: "Contractor"
- **Includes 3 Pre-configured FAQs**:
  1. "What services do you offer?" → "We provide home renovations, repairs, remodeling, and custom builds."
  2. "Do you offer free estimates?" → "Yes! We provide free estimates for all projects. When works best for you?"
  3. "Are you licensed and insured?" → "Yes, we are fully licensed, bonded, and insured."

#### Template 4: Dental Office
- **Icon**: 🦷
- **Name**: "Dental Office"
- **Includes 3 Pre-configured FAQs**:
  1. "What services do you offer?" → "We offer cleanings, exams, fillings, crowns, whitening, and cosmetic dentistry."
  2. "Do you accept insurance?" → "Yes, we accept most major dental insurance plans."
  3. "How often should I visit?" → "We recommend a cleaning and checkup every 6 months."

### Navigation:
- **"Back" Button** → Returns to Step 1
  - **Icon**: ArrowLeft
- **"Continue" Button** → Advances to Step 3
  - **Icon**: ArrowRight
  - **Validation**: Checks template selected

## Step 3: Preview & Publish

### Preview Section:
**Mock Chat Display**:
- **Avatar Circle** - Gradient with sparkles icon
- **Message Bubble** - Shows greeting message
  - **Content**: "Hi! Thanks for calling {businessName}. This is {receptionistName}. How can I help you today?"
- **Style**: Primary background, rounded corners

### Status Badge:
- **Text**: "Demo Mode Active - Ready to test!"
- **Icon**: Sparkles
- **Color**: Primary with light background

### Navigation:
- **"Back" Button** → Returns to Step 2
- **"Publish My Receptionist" Button** → Creates receptionist
  - **Icon**: Check
  - **Action**: Calls publish handler

## Publish Handler Logic:

### Database Operations:
1. **Creates Receptionist** in `receptionists` table:
   ```sql
   INSERT INTO receptionists (
     user_id,
     name,
     business_name,
     tone,
     language,
     greeting_message,
     persona_description
   )
   ```

2. **Creates FAQs** in `receptionist_faqs` table:
   ```sql
   INSERT INTO receptionist_faqs (
     receptionist_id,
     question,
     answer,
     priority
   ) VALUES
   -- All template FAQs
   ```

3. **Updates Profile** in `profiles` table:
   ```sql
   UPDATE profiles 
   SET onboarding_completed = true 
   WHERE id = current_user
   ```

### On Success:
- **Toast Notification**: "🎉 Your AI Receptionist '{name}' has been created successfully!"
- **Redirect**: → `/dashboard`

## Purpose & Connections:

**Purpose**: First-time user setup - creates foundation for entire system

**Connections**:
- **Creates**: Receptionist record (core of entire system)
- **Creates**: FAQs (enables instant answers)
- **Links to**: Dashboard (after completion)
- **Used by**: New users after signup
- **Data Impact**: Creates records in `receptionists` and `receptionist_faqs` tables

---

# 🏗️ BUILDER PAGE
**Route**: `/builder` or `/builder/:id`
**Component**: `Builder.tsx`

## Page Layout (2-Column Grid)

### Left Panel (Configuration)

#### Analytics Panel (Top)
**Component**: `BuilderAnalyticsPanel.tsx`
**Visibility**: Only when receptionist ID exists

**Displays**:
- **Response Quality Score** - Average quality from AI responses
- **Total Conversations** - Count of chats
- **Booking Rate** - Percentage of conversations that led to bookings
- **Average Latency** - Response time in milliseconds

**Data Source**: `ai_responses` table filtered by receptionist_id

#### Receptionist Configuration Form

**Field 1: Receptionist Name**
- **Label**: "Receptionist Name"
- **Type**: Text input
- **Required**: Yes
- **Stored in**: `receptionists.name`

**Field 2: Business Name**
- **Label**: "Business Name"
- **Type**: Text input
- **Required**: Yes
- **Stored in**: `receptionists.business_name`

**Field 3: Business Type**
- **Label**: "Business Type"
- **Type**: Text input
- **Example**: "Dental Clinic", "Hair Salon"
- **Stored in**: `receptionists.business_type`

**Field 4: Business Phone**
- **Label**: "Business Phone"
- **Type**: Text input
- **Format**: Phone number
- **Stored in**: `receptionists.phone` AND `receptionists.business_phone` (synced)

**Field 5: Tone of Voice**
- **Label**: "Tone of Voice"
- **Type**: Dropdown select
- **Options**:
  - Friendly
  - Professional
  - Playful
- **Stored in**: `receptionists.tone`

**Field 6: Greeting Message**
- **Label**: "Greeting Message"
- **Type**: Textarea (2 rows)
- **Purpose**: First message AI sends to customers
- **Example**: "Hi! Thanks for calling {business}..."
- **Stored in**: `receptionists.greeting_message`

**Field 7: Default Response**
- **Label**: "Default Response"
- **Type**: Textarea (2 rows)
- **Purpose**: Fallback when AI doesn't know answer
- **Default**: "I'm sorry — I don't have that info yet."
- **Stored in**: `receptionists.default_response`

**Field 8: Knowledge Base**
- **Label**: "Knowledge Base (short)"
- **Type**: Textarea (4 rows)
- **Purpose**: Context for AI - business info, policies, etc.
- **Stored in**: `receptionists.knowledge_base`

**Field 9: System Prompt**
- **Label**: "System Prompt (optional)"
- **Type**: Textarea (4 rows)
- **Purpose**: Advanced AI configuration
- **Stored in**: `receptionists.system_prompt`

#### Action Buttons Row:

**Button 1: Save & Update**
- **Text**: "Save & Update" (if editing) or "Save & Generate AI Receptionist" (if new)
- **Color**: Yellow/Primary
- **Disabled**: While saving
- **Action**: 
  - If `receptionistId` exists: **UPDATE** existing receptionist
  - If no `receptionistId`: **INSERT** new receptionist
- **Database Operation**:
  ```sql
  UPDATE receptionists SET 
    name = ?,
    business_name = ?,
    -- ... all fields
  WHERE id = ? AND user_id = current_user
  ```
- **On Success**: 
  - Shows toast "Receptionist updated successfully!"
  - Reloads receptionist data
  - If new: Navigates to `/builder/{new_id}`

**Button 2: Test Your AI Receptionist**
- **Text**: "Test Your AI Receptionist"
- **Color**: Blue
- **Visibility**: Only if receptionist ID exists
- **Action**: Scrolls to chat preview area (stays on same page)

**Button 3: New Receptionist**
- **Text**: "New Receptionist"
- **Color**: Gray/Outline
- **Action**: 
  - Clears all form fields
  - Removes receptionist ID
  - Navigates to `/builder` (without ID)

#### FAQ Manager Section
**Component**: `FAQManager.tsx`
**Visibility**: Only when receptionist ID exists

**Title**: Section with FAQ icon

**FAQ List**: Shows all FAQs for this receptionist

**Each FAQ Item Shows**:
- **Question Text** - Editable inline
- **Answer Text** - Editable inline
- **Priority Number** - Controls order
- **Delete Button** - Removes FAQ

**Add New FAQ Form**:
- **Question Input** - Text input
- **Answer Input** - Textarea
- **Priority Input** - Number input
- **"Add FAQ" Button** - Creates new FAQ

**Database Operations**:
- **Read**: `SELECT * FROM receptionist_faqs WHERE receptionist_id = ?`
- **Create**: `INSERT INTO receptionist_faqs (receptionist_id, question, answer, priority)`
- **Update**: `UPDATE receptionist_faqs SET question = ?, answer = ?, priority = ?`
- **Delete**: `DELETE FROM receptionist_faqs WHERE id = ?`

#### Widget Embed Code Section
**Component**: `WidgetEmbedCode.tsx`
**Visibility**: Only when receptionist ID and name exist

**Direct Link Section**:
- **Label**: "Direct Link"
- **URL Display**: `{domain}/widget?rid={receptionistId}`
- **Copy Button** - Copies URL to clipboard
- **Open Button** - Opens widget in new tab

**Embed Code Section**:
- **Label**: "Embed Code (Copy & Paste)"
- **Code Display**: Shows iframe embed code:
  ```html
  <iframe 
    src="{domain}/widget?rid={receptionistId}"
    style="position: fixed; bottom: 20px; right: 20px; 
           width: 400px; height: 600px; border: none; 
           border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
           z-index: 9999;"
    title="{receptionistName} - AI Chat"
  ></iframe>
  ```
- **Copy Button** - Copies embed code to clipboard

**Instructions Section**:
- **Title**: "How to embed:"
- **Steps**:
  1. Copy the embed code above
  2. Open your website's HTML file
  3. Paste the code just before the closing </body> tag
  4. Save and publish your website
  5. The chat widget will appear in the bottom-right corner

**Purpose**: Enables business owners to deploy chat widget

### Right Panel (Chat Testing)

#### Header Section:

**Left Side**:
- **Receptionist Info**:
  - **Title**: "{receptionist.name} — Tone: {receptionist.tone}"
  - **Subtitle**: "{receptionist.business_name}"

**Right Side Controls**:
- **Preview Toggle Button**:
  - **Text**: "Preview: ON" or "Preview: OFF"
  - **Action**: Toggles preview mode (currently not implemented)
- **Refresh Button**:
  - **Text**: "Refresh"
  - **Action**: Reloads chat message history

#### Chat Messages Area:

**Empty State**:
- **Text**: "No conversation yet — try saying "Hi" or ask about services."
- **Visibility**: When no messages exist

**Message Display** (for each message):
- **User Messages**:
  - **Alignment**: Right side
  - **Background**: Gray (muted)
  - **Content**: Message text
  - **Sender Label**: "You"
  - **Timestamp**: When sent

- **Bot Messages**:
  - **Alignment**: Left side
  - **Background**: Yellow/Primary tint
  - **Content**: AI response text
  - **Sender Label**: Receptionist name
  - **Timestamp**: When received

**Auto-scroll**: Automatically scrolls to newest message

#### Alternative Times Panel
**Visibility**: Only when AI offers alternative appointment slots

**Title**: "📅 Available Alternative Times"

**Each Alternative Slot Shows**:
- **Date**: Formatted (e.g., "Mon, Dec 23")
- **Time**: Formatted (e.g., "2:00 PM")
- **Reason**: Why suggested (optional)
- **Match Score**: Percentage match (optional)
- **"Book This Time" Button**:
  - **Action**: Calls `book-appointment` edge function
  - **On Success**: Creates appointment
  - **Shows Toast**: "✅ Appointment Booked!"
  - **Adds Confirmation Message**: To chat

**Close Button**: "Close alternatives" - Hides panel

#### Chat Input Area:

**Message Input Field**:
- **Type**: Text input
- **Placeholder**: 'Try: "Hi", "How much is a cleaning?"'
- **Behavior**: 
  - Enter key sends message
  - Shift+Enter creates new line

**Send Button**:
- **Text**: "Send"
- **Color**: Black
- **Action**: Sends message to chat edge function

**Voice Button** (Not yet functional):
- **Icon**: 🎙️
- **Tooltip**: "Voice (coming soon)"

**Play Button** (Not yet functional):
- **Icon**: 🔊
- **Tooltip**: "Play reply (coming soon)"

## Chat Functionality

### Send Message Flow:

1. **User Types Message** → Clicks Send or presses Enter

2. **Optimistic UI Update**:
   - Immediately adds user message to chat
   - Shows message as sent (don't wait for server)

3. **API Call** to `/functions/v1/chat`:
   - **Payload**:
     ```json
     {
       "messages": [{"role": "user", "content": "user message"}],
       "receptionistId": "...",
       "userId": "..."
     }
     ```

4. **Edge Function Processes**:
   - Loads receptionist config
   - Loads FAQs
   - Detects booking intent
   - Calls AI model (Lovable AI / Gemini)
   - Checks availability if booking
   - Books appointment or offers alternatives

5. **Receives Response**:
   ```json
   {
     "reply": "AI message",
     "alternatives": [...], // if time not available
     "appointment": {...}   // if successfully booked
   }
   ```

6. **Updates UI**:
   - Adds bot message to chat
   - If alternatives: Shows alternative times panel
   - If booked: Shows success toast
   - Logs analytics data

7. **Error Handling**:
   - If 402 (payment required): Shows "Lovable AI credits exhausted" error
   - If 429 (rate limit): Shows "Rate limit exceeded" error
   - Other errors: Shows generic error message

### Message Storage:

**Database Table**: `chat_messages`
**Created by**: Edge function (not client)

**Each message creates record**:
```sql
INSERT INTO chat_messages (
  receptionist_id,
  user_id,
  sender, -- 'user' or 'bot'
  message,
  created_at
)
```

### Analytics Integration:

**After each message exchange**:
- **Calls**: `/functions/v1/analytics/ingest`
- **Payload**:
  ```json
  {
    "receptionist_id": "...",
    "request_message": "user message",
    "reply_text": "bot reply",
    "latency_ms": 450,
    "channel": "builder_preview",
    "model": "gpt-4",
    "temperature": 0.7,
    "confidence": 0.85,
    "quality_score": {
      "coherence": 0.9,
      "relevance": 0.85,
      "completeness": 0.8
    }
  }
  ```

**Creates Record** in `ai_responses` table

## Purpose & Connections:

**Purpose**: Complete receptionist configuration and testing environment

**Connections**:
- **Creates/Updates**: `receptionists` table
- **Manages**: `receptionist_faqs` table
- **Tests**: Chat edge function
- **Creates**: `chat_messages` records
- **Creates**: `ai_responses` records
- **Integrates with**: Services (for booking), Availability (for time slots)
- **Links to**: Dashboard (via back navigation)
- **Provides**: Widget embed code for website deployment

---

# 💼 SERVICES PAGE
**Route**: `/services`
**Component**: `Services.tsx`

## Header Section

**Left Side**:
- **Title**: "Services Management" (h1)
- **Description**: "Define services that customers can book via AI chat"

**Right Side**:
- **Refresh Button**:
  - **Icon**: RefreshCw (spinning when loading)
  - **Text**: "Refresh"
  - **Action**: Reloads services list

## Receptionist Selector Section

**Visibility**: Only if user has receptionists

**Card containing**:
- **Title**: "Select Receptionist"
- **Description**: "Manage services for a specific receptionist"
- **Dropdown Select**:
  - **Options**: All user's receptionists
  - **Display Format**: "{receptionist.name} - {receptionist.business_name}"
  - **Action on Change**: Filters services by selected receptionist

**Empty State** (if no receptionists):
- **Message**: "Please create a receptionist first to manage services."
- **"Create Receptionist" Button** → `/onboarding`

## Create Service Form

**Visibility**: Only if receptionist selected

**Card containing**:
- **Title**: "Create New Service" (with Plus icon)
- **Description**: "Add a service that your AI receptionist can book"

### Form Fields:

**Row 1 (2 columns)**:

**Field 1: Service Name**
- **Label**: "Service Name *"
- **Type**: Text input
- **Placeholder**: "e.g., Haircut, Massage, Consultation"
- **Required**: Yes

**Field 2: Duration**
- **Label**: "Duration (minutes)"
- **Type**: Number input
- **Default**: 30
- **Purpose**: How long service takes

**Row 2 (Full width)**:

**Field 3: Description**
- **Label**: "Description (Optional)"
- **Type**: Text input
- **Placeholder**: "Brief description of the service"

**Row 3 (2 columns)**:

**Field 4: Buffer Before**
- **Label**: "Buffer Before (minutes)"
- **Type**: Number input
- **Default**: 5
- **Purpose**: Setup time before appointment

**Field 5: Buffer After**
- **Label**: "Buffer After (minutes)"
- **Type**: Number input
- **Default**: 5
- **Purpose**: Cleanup time after appointment

**Submit Button**:
- **Text**: "Create Service" (or "Creating..." when loading)
- **Icon**: Plus
- **Action**: Creates service in database
- **Database Operation**:
  ```sql
  INSERT INTO services (
    user_id,
    receptionist_id,
    name,
    description,
    duration_minutes,
    buffer_before_minutes,
    buffer_after_minutes,
    active
  ) VALUES (?, ?, ?, ?, ?, ?, ?, true)
  ```
- **On Success**:
  - Shows toast "Service created successfully"
  - Clears form
  - Reloads services list

## Services List Section

**Empty State** (no services):
- **Card with**: "No services yet. Create your first service above."

**Service Cards** (one per service):

### Each Service Card Shows:

**Left Side**:
- **Service Name** - Bold, large text
- **Status Badge**: 
  - "Active" (primary color) if `active = true`
  - "Inactive" (secondary color) if `active = false`
- **Description** - Smaller text (if exists)
- **Details Line**: "Duration: {X}min • Buffer: {Y}min before / {Z}min after"

**Right Side Buttons**:

**Button 1: Activate/Deactivate**
- **Text**: "Deactivate" (if active) or "Activate" (if inactive)
- **Style**: Outline
- **Action**: Toggles `active` field
- **Database Operation**:
  ```sql
  UPDATE services 
  SET active = NOT active 
  WHERE id = ? AND user_id = current_user
  ```

**Button 2: Delete**
- **Icon**: Trash2 (red)
- **Style**: Destructive
- **Action**: Prompts confirmation, then deletes
- **Database Operation**:
  ```sql
  DELETE FROM services 
  WHERE id = ? AND user_id = current_user
  ```

## Purpose & Connections:

**Purpose**: Define bookable services with timing

**Connections**:
- **Linked to**: Specific receptionist via `receptionist_id`
- **Used by**: Chat booking flow (AI offers these services)
- **Used by**: `check-availability` edge function (calculates time slots)
- **Used by**: `book-appointment` edge function (books specific service)
- **Data from**: `services` table
- **Filters by**: Selected receptionist

**Data Flow Example**:
1. User creates "Haircut" service - 30min duration, 5min buffer each side
2. Customer chats with AI: "I need a haircut"
3. AI checks availability for 40min slot (30 + 5 + 5)
4. Books appointment with service_id linking to "Haircut"
5. Appointment shows in calendar with correct duration

---

# 📅 AVAILABILITY PAGE
**Route**: `/availability`
**Component**: `Availability.tsx`

## Header

**Title**: "Business Hours & Availability" (h1)
**Description**: "Set when your AI receptionist can book appointments"

## Receptionist Selector

**Card containing**:
- **Title**: "Select Receptionist"
- **Description**: "Choose which receptionist to configure"
- **Dropdown Select**:
  - **Options**: All user's receptionists
  - **Display**: "{receptionist.name} - {receptionist.business_name}"
  - **Action**: Loads availability rules for selected receptionist

## Quick Setup Card

**Visibility**: Only if receptionist selected AND no rules exist

**Card displaying**:
- **Icon**: AlertCircle
- **Title**: "Quick Setup"
- **Description**: "No availability rules set. Start with default business hours?"
- **"Set Default Hours" Button**:
  - **Text**: "Set Default Hours (Mon-Fri, 9am-5pm)"
  - **Action**: Creates 5 rules (one per weekday)
  - **Database Operation**:
    ```sql
    INSERT INTO availability_rules 
    (receptionist_id, day_of_week, start_time, end_time, timezone)
    VALUES
    (?, 1, '09:00', '17:00', 'Africa/Lagos'),
    (?, 2, '09:00', '17:00', 'Africa/Lagos'),
    (?, 3, '09:00', '17:00', 'Africa/Lagos'),
    (?, 4, '09:00', '17:00', 'Africa/Lagos'),
    (?, 5, '09:00', '17:00', 'Africa/Lagos')
    ```

## Weekly Schedule Card

**Title**: "Weekly Schedule" (with Clock icon)
**Description**: "Define your regular business hours"

### Current Rules Display:

**Loading State**: "Loading..."

**Empty State**: "No availability rules set. Add your first rule below."

**Rules List** (one card per rule):

**Each Rule Shows**:
- **Day Badge**: "Monday", "Tuesday", etc. (outline style)
- **Time Range**: "09:00 - 17:00" (bold)
- **Timezone Badge**: "Africa/Lagos" (secondary)
- **Delete Button**:
  - **Icon**: Trash2 (red)
  - **Action**: Deletes rule
  - **Database Operation**:
    ```sql
    DELETE FROM availability_rules 
    WHERE id = ? AND receptionist_id IN (user's receptionists)
    ```

**Data Source**:
```sql
SELECT * FROM availability_rules
WHERE receptionist_id = selected_receptionist
ORDER BY day_of_week, start_time
```

### Add New Rule Form:

**Grid (4 columns)**:

**Column 1: Day Selector**
- **Label**: "Day"
- **Type**: Select dropdown
- **Options**:
  - 0: Sunday
  - 1: Monday
  - 2: Tuesday
  - 3: Wednesday
  - 4: Thursday
  - 5: Friday
  - 6: Saturday

**Column 2: Start Time**
- **Label**: "Start Time"
- **Type**: Time input (HTML5)
- **Default**: "09:00"

**Column 3: End Time**
- **Label**: "End Time"
- **Type**: Time input (HTML5)
- **Default**: "17:00"

**Column 4: Timezone**
- **Label**: "Timezone"
- **Type**: Select dropdown
- **Options**:
  - Africa/Lagos
  - America/New_York
  - America/Los_Angeles
  - Europe/London
  - Asia/Dubai
  - Asia/Tokyo
  - UTC

**Add Rule Button**:
- **Text**: "Add Rule"
- **Icon**: Plus
- **Action**: Creates rule
- **Database Operation**:
  ```sql
  INSERT INTO availability_rules (
    receptionist_id,
    day_of_week,
    start_time,
    end_time,
    timezone
  ) VALUES (?, ?, ?, ?, ?)
  ```

## Time-Off & Exceptions Card

**Title**: "Time-Off & Exceptions" (with Calendar icon)
**Description**: "Block specific dates/times (holidays, vacations, etc.)"

### Current Exceptions Display:

**Empty State**: "No exceptions set"

**Exception Cards** (one per exception):

**Each Exception Shows**:
- **Date Range**: "12/25/2024 2:00 PM - 12/25/2024 6:00 PM"
- **Reason**: "Holiday" (if provided)
- **Delete Button**:
  - **Icon**: Trash2 (red)
  - **Action**: Deletes exception
  - **Database Operation**:
    ```sql
    DELETE FROM availability_exceptions 
    WHERE id = ? AND receptionist_id IN (user's receptionists)
    ```

**Data Source**:
```sql
SELECT * FROM availability_exceptions
WHERE receptionist_id = selected_receptionist
ORDER BY start_timestamptz
```

### Add Exception Form:

**Grid (3 columns)**:

**Column 1: Start Date & Time**
- **Label**: "Start Date & Time"
- **Type**: datetime-local input
- **Purpose**: When exception begins

**Column 2: End Date & Time**
- **Label**: "End Date & Time"
- **Type**: datetime-local input
- **Purpose**: When exception ends

**Column 3: Reason**
- **Label**: "Reason (Optional)"
- **Type**: Text input
- **Placeholder**: "Holiday, vacation, etc."

**Add Exception Button**:
- **Text**: "Add Exception"
- **Icon**: Plus
- **Action**: Creates exception
- **Database Operation**:
  ```sql
  INSERT INTO availability_exceptions (
    receptionist_id,
    start_timestamptz,
    end_timestamptz,
    reason
  ) VALUES (?, ?, ?, ?)
  ```

## Purpose & Connections:

**Purpose**: Define when AI can book appointments

**Connections**:
- **Linked to**: Specific receptionist
- **Used by**: `check-availability` edge function
  - Checks day of week against rules
  - Checks time range against rules
  - Checks exceptions for conflicts
- **Used by**: Chat booking flow
  - AI only offers times within availability
  - Suggests alternatives if time unavailable
- **Tables**: 
  - `availability_rules` - Weekly recurring hours
  - `availability_exceptions` - One-time blocks

**Data Flow Example**:
1. Business sets hours: Mon-Fri 9am-5pm, timezone Lagos
2. Adds exception: Dec 25, all day (Christmas)
3. Customer asks for appointment "tomorrow at 2pm"
4. If tomorrow is Wednesday Dec 20: ✅ Available (within 9-5)
5. If tomorrow is Saturday: ❌ Not available (no Saturday rule)
6. If tomorrow is Dec 25: ❌ Not available (exception blocks)
7. AI offers alternative times that match rules

---

# 💬 CONVERSATIONS PAGE
**Route**: `/conversations`
**Component**: `Conversations.tsx`

## Header

**Left Side**:
- **"Back to Dashboard" Button**:
  - **Icon**: ArrowLeft
  - **Action**: Navigate to `/dashboard`

## Main Card

### Header Section:

**Left Side**:
- **Icon**: MessageSquare (large, primary color)
- **Title**: "Conversation History" (h1)
- **Description**: "View all receptionist conversations"

**Right Side** (if receptionists exist):
- **Receptionist Filter Dropdown**:
  - **Type**: Select
  - **Default Option**: "All Receptionists"
  - **Options**: Each receptionist "{name} - {business_name}"
  - **Action**: Filters conversations by receptionist

## Conversations Loading State:

**Display** (3 skeleton cards):
- **Skeleton Header** - 75% width
- **Skeleton Content** - Full width
- **Animation**: Pulse loading effect

## Conversations Empty State:

**Display**:
- **Icon**: MessageSquare (large, muted)
- **Text**: "No conversations yet"
- **Style**: Centered, muted color

## Conversation List:

**Data Query**:
```sql
SELECT c.*, r.name, r.business_name
FROM conversations c
LEFT JOIN receptionists r ON c.receptionist_id = r.id
WHERE c.receptionist_id IN (user's receptionists)
  AND (filter = 'all' OR c.receptionist_id = selected_receptionist)
ORDER BY c.created_at DESC
LIMIT 50
```

### Each Conversation Card:

**Card Container**:
- **Hover Effect**: Background changes to accent color
- **Click**: No action (display only)

**Receptionist Badge** (top, if available):
- **Display**: "{receptionist.name} - {receptionist.business_name}"
- **Style**: Small, rounded, primary background
- **Purpose**: Shows which AI handled this conversation

**Customer Message Section**:
- **Label**: "Customer:" (small, bold, primary)
- **Content**: User's message text
- **Style**: Small text, full width

**Receptionist Message Section**:
- **Label**: "Receptionist:" (small, bold, secondary)
- **Content**: AI's response text
- **Style**: Small text, full width

**Footer Section** (bottom, border-top):
- **Left**: Timestamp - "12/23/2024, 3:45 PM"
- **Right** (if exists): Direction badge - "inbound" or "outbound"
  - **Style**: Small, rounded, primary background

## Purpose & Connections:

**Purpose**: Review all AI chat interactions for quality and tracking

**Connections**:
- **Data from**: `conversations` table
- **Joined with**: `receptionists` table (to show which AI)
- **Created by**: `chat` edge function (logs every interaction)
- **Filtered by**: Selected receptionist
- **Used for**: 
  - Quality review
  - Training data
  - Customer service monitoring
  - Debugging

**Data Flow Example**:
1. Customer chats with AI in widget
2. `chat` edge function processes
3. Creates record in `conversations`:
   ```sql
   INSERT INTO conversations (
     receptionist_id,
     user_message,
     bot_message,
     direction,
     metadata
   )
   ```
4. Business owner views in Conversations page
5. Can filter by specific receptionist
6. Sees complete conversation history

---

# 📆 APPOINTMENTS PAGE
**Route**: `/appointments`
**Component**: `Appointments.tsx`

## Header Section

**Left Side**:
- **Title**: "Appointments Calendar" (h1)
- **Description**: "View all appointments booked via AI chat"

**Right Side**:
- **Receptionist Filter** (if receptionists exist):
  - **Type**: Select dropdown
  - **Default**: "All Receptionists"
  - **Options**: Each receptionist "{name} - {business_name}"
  - **Action**: Filters appointments

- **Refresh Button**:
  - **Icon**: RefreshCw (spinning when loading)
  - **Text**: "Refresh"
  - **Action**: Reloads appointments

## Info Alert

**Card**:
- **Icon**: MessageCircle
- **Background**: Primary tint (5% opacity)
- **Border**: Primary (20% opacity)
- **Text**: "Appointments are booked automatically when customers chat with your AI receptionist. Go to the Builder page to test the booking flow."

**Purpose**: Explains where appointments come from

## Loading State:

**Display**:
- **Icon**: RefreshCw (spinning, primary)
- **Text**: "Loading appointments..."
- **Style**: Centered

## Appointments Calendar

**Component**: `AppointmentCalendar.tsx`

**Data Query**:
```sql
SELECT * FROM appointments
WHERE receptionist_id IN (user's receptionists)
  AND (filter = 'all' OR receptionist_id = selected_receptionist)
ORDER BY start_time ASC
```

### Calendar View Features:

**Month View**:
- Shows current month grid
- Each day cell shows appointment count
- Click day to see appointments

**Week View**:
- Shows 7 days in column format
- Time slots on left
- Appointments as blocks in time slots

**Day View**:
- Single day with hour slots
- Appointments shown as colored blocks

**Appointment Details in Calendar**:
- **Service Name**: Bold
- **Customer Name**: Regular text
- **Time Range**: Start - End
- **Status Color**:
  - Booked: Blue
  - Cancelled: Red
  - Completed: Green

## Purpose & Connections:

**Purpose**: Visual calendar view of all booked appointments

**Connections**:
- **Data from**: `appointments` table
- **Created by**: 
  - `book-appointment` edge function (via chat)
  - Can also be manually created (though UI removed)
- **Filtered by**: Selected receptionist
- **Linked to**: 
  - `services` table (via service_id)
  - `receptionists` table (via receptionist_id)
- **Updated by**:
  - `appointment-action` edge function (confirm/cancel)

**Data Flow Example**:
1. Customer books via chat widget
2. `book-appointment` creates record:
   ```sql
   INSERT INTO appointments (
     receptionist_id,
     service_id,
     service,
     customer_name,
     customer_phone,
     customer_email,
     start_time,
     end_time,
     status,
     metadata
   )
   ```
3. Appointment appears in calendar
4. Business owner can view/filter
5. Customer receives confirm/cancel links
6. Status updates when confirmed/cancelled

---

# 🔔 NOTIFICATIONS PAGE
**Route**: `/notifications`
**Component**: `Notifications.tsx`

## Page Setup

**On Mount Actions**:
1. **Request Browser Notification Permission**
   - Calls `Notification.requestPermission()`
   - Required for push notifications

2. **Load Notifications from Database**
   - Queries `notifications` table

3. **Set up Realtime Listener**
   - Listens for new notifications
   - Shows browser push when received

## Header

**Left Side**:
- **"Back to Dashboard" Button**:
  - **Icon**: ArrowLeft
  - **Action**: Navigate to `/dashboard`

## Main Content

### Header Bar:

**Left**:
- **Icon**: Bell (primary)
- **Title**: "Notifications" (h1)
- **Description**: "View your system notifications"

**Right**:
- **"Mark All as Read" Button**:
  - **Visibility**: Only if unread notifications exist
  - **Action**: Updates all notifications to `read = true`
  - **Database Operation**:
    ```sql
    UPDATE notifications 
    SET read = true 
    WHERE user_id = current_user AND read = false
    ```

### Notifications Loading State:

**Display** (3 skeleton cards):
- Pulse loading animation

### Notifications Empty State:

**Display**:
- **Icon**: Bell (large, muted)
- **Text**: "No notifications yet"
- **Style**: Centered

### Notifications List:

**Data Query**:
```sql
SELECT * FROM notifications
WHERE user_id = current_user
ORDER BY created_at DESC
LIMIT 50
```

### Each Notification Card:

**Card Style**:
- **Unread**: Primary background (5% opacity), bold title
- **Read**: Normal background, regular title
- **Hover**: Accent background

**Left Side** (Main Content):

**Top Row**:
- **Title** - Bold text
- **Severity Badge** (if critical/warning):
  - Critical: Red background
  - Warning: Yellow background
  - Info: Blue background

**Middle Row**:
- **Body Text** - Full message content
- **Metadata Display** (if exists) - Smaller, muted

**Bottom Row**:
- **Timestamp** - "2 hours ago" format
- **Category Badge** (if exists) - "Appointment", "System", etc.

**Right Side** (Actions):

**Top Button**: Mark as Read/Unread Toggle
- **Icon**: Eye or EyeOff
- **Action**: Toggles `read` field
- **Database**:
  ```sql
  UPDATE notifications 
  SET read = NOT read 
  WHERE id = ? AND user_id = current_user
  ```

**Bottom Button**: Delete
- **Icon**: Trash2 (red)
- **Action**: Deletes notification
- **Database**:
  ```sql
  DELETE FROM notifications 
  WHERE id = ? AND user_id = current_user
  ```

### Notification Types:

**appointment.created**:
- **Icon**: Calendar (green)
- **Title**: "New Appointment Booked"
- **Body**: "Appointment for {customer} on {date}"
- **Created by**: `book-appointment` edge function

**appointment.cancelled**:
- **Icon**: CalendarX (orange)
- **Title**: "Appointment Cancelled"
- **Body**: "Appointment for {customer} was cancelled"
- **Created by**: `appointment-action` edge function

**appointment.reminder**:
- **Icon**: Clock (blue)
- **Title**: "Appointment Reminder"
- **Body**: "Upcoming appointment tomorrow at {time}"
- **Created by**: `send-reminder` edge function

**quality.low**:
- **Icon**: AlertTriangle (yellow)
- **Severity**: Warning
- **Title**: "Low Quality Response Detected"
- **Created by**: Quality review system

**quality.flagged**:
- **Icon**: AlertCircle (red)
- **Severity**: Critical
- **Title**: "Response Flagged for Review"

**system.error**:
- **Icon**: XCircle (red)
- **Severity**: Critical
- **Title**: "System Error"

## Realtime Functionality:

**Supabase Realtime Channel**:
```javascript
supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    // Add notification to list
    // Show browser push notification
  })
  .subscribe()
```

**Browser Push Notification**:
- **Title**: Notification title
- **Body**: Notification message
- **Icon**: App icon
- **Click**: Focuses window, shows notification in list

**Permission States**:
- **Granted**: Shows push notifications
- **Denied**: Only shows in-app
- **Default**: Prompts for permission on page load

## Purpose & Connections:

**Purpose**: Real-time alert system for important events

**Connections**:
- **Data from**: `notifications` table
- **Created by**: 
  - Edge functions (`send-reminder`, `book-appointment`, etc.)
  - Quality review system
  - System monitors
- **Real-time updates**: Via Supabase Realtime
- **Browser integration**: Native push notifications
- **Used for**:
  - Appointment alerts
  - Quality warnings
  - System status
  - Business updates

**Data Flow Example**:
1. Customer books appointment
2. `book-appointment` calls `create-notification`:
   ```typescript
   supabase.functions.invoke('create-notification', {
     body: {
       type: 'appointment.created',
       title: 'New Appointment Booked',
       body: 'John Doe booked Haircut for tomorrow',
       receptionist_id: '...',
       severity: 'info'
     }
   })
   ```
3. Creates record in `notifications` table
4. Realtime listener detects INSERT
5. Shows browser push notification
6. Adds to notifications list
7. Business owner sees alert, clicks, reads details

---

# ⚙️ SETTINGS PAGE
**Route**: `/settings`
**Component**: `Settings.tsx`

## Page Layout

**Tabbed Interface** (3 tabs):

### Tab 1: Account

#### Profile Information Section:

**Card containing**:

**Field 1: Full Name**
- **Label**: "Full Name"
- **Type**: Text input
- **Value**: From `profiles.full_name`

**Field 2: Email**
- **Label**: "Email"
- **Type**: Text input (readonly/disabled)
- **Value**: From `profiles.email`
- **Note**: "Cannot be changed after registration"

**Field 3: Timezone**
- **Label**: "Timezone"
- **Type**: Select dropdown
- **Options**: Major timezones
- **Value**: From `profiles.timezone`

**Save Profile Button**:
- **Text**: "Save Changes"
- **Action**: Updates profile
- **Database**:
  ```sql
  UPDATE profiles 
  SET full_name = ?, timezone = ? 
  WHERE id = current_user
  ```

#### Password & Security Section:

**Card containing**:
- **Title**: "Password & Security"
- **"Change Password" Button**: (Placeholder)
- **"Two-Factor Authentication" Toggle**: (Placeholder)

#### Plan & Billing Section:

**Card containing**:
- **Title**: "Plan & Billing"
- **Current Plan Display**: "Free" / "Pro" / "Enterprise"
- **"Upgrade Plan" Button**: (Placeholder)

### Tab 2: Notifications

#### Notification Preferences:

**Card containing**:

**Setting 1: Push Notifications**
- **Label**: "Push Notifications"
- **Type**: Toggle switch
- **Description**: "Receive browser push notifications for important events"
- **Default**: On

**Setting 2: Email Notifications**
- **Label**: "Email Notifications"
- **Type**: Toggle switch
- **Description**: "Receive email alerts for appointments and important updates"
- **Default**: On

**Test Button**:
- **"Send Test Notification" Button**:
  - **Action**: Calls `create-notification` edge function
  - **Creates**: Test notification
  - **Purpose**: Verify notification system working

### Tab 3: Integrations

**Card containing**:
- **Title**: "Connected Integrations"
- **Description**: "Manage your third-party integrations"

**Integration Cards** (placeholders):

1. **Google Calendar**
   - **Icon**: Calendar
   - **Status**: "Not Connected"
   - **"Connect Later" Button**

2. **Twilio SMS**
   - **Icon**: MessageSquare
   - **Status**: "Not Connected"
   - **"Connect Later" Button**

3. **Stripe Payments**
   - **Icon**: CreditCard
   - **Status**: "Not Connected"
   - **"Connect Later" Button**

## Purpose & Connections:

**Purpose**: Account configuration and preferences

**Connections**:
- **Data from**: `profiles` table
- **Updates**: User profile information
- **Controls**: Notification preferences
- **Links to**: External integrations (future)

---

# 🤖 PUBLIC CHAT WIDGET
**Route**: `/widget?rid={RECEPTIONIST_ID}`
**Component**: `Widget.tsx`
**Access**: Public (no authentication required)

## Widget Loading:

**On Mount**:
1. **Read URL Parameter**: `rid` (receptionist ID)
2. **Load Receptionist Data**:
   ```sql
   SELECT name, business_name, greeting_message, active
   FROM receptionists
   WHERE id = ? AND active = true
   ```
3. **If not found**: Show error
4. **If found**: Show chat interface with greeting

## Widget Layout:

### Header Section:
**Background**: Gradient (primary to primary-glow)
**Color**: Primary foreground (white)

**Left Side**:
- **Avatar Circle**: 
  - **Background**: White with transparency
  - **Icon**: MessageCircle
- **Receptionist Info**:
  - **Name**: Large, bold text
  - **Business Name**: Smaller text

### Messages Area:
**Background**: Muted/light background

**Greeting Message** (auto-added on load):
- **Role**: Assistant
- **Content**: From `receptionists.greeting_message`
- **Timestamp**: Current time

**Message Display**:

**User Messages**:
- **Alignment**: Right
- **Background**: Primary color
- **Color**: Primary foreground (white)
- **Border Radius**: Rounded
- **Timestamp**: Below message

**Assistant Messages**:
- **Alignment**: Left
- **Background**: Card color
- **Border**: Border color
- **Border Radius**: Rounded
- **Timestamp**: Below message

**Loading Indicator** (while AI responds):
- **Alignment**: Left
- **Display**: Spinning loader icon

**Auto-scroll**: Scrolls to newest message automatically

### Input Area:
**Background**: Card color
**Border-top**: Border color

**Message Input**:
- **Type**: Text input
- **Placeholder**: "Type your message..."
- **Disabled**: While loading
- **Enter Key**: Sends message
- **Shift+Enter**: New line

**Send Button**:
- **Icon**: Send (or spinning loader when sending)
- **Disabled**: When loading or input empty
- **Action**: Sends message

**Footer Text**:
- **Text**: "Powered by AI Receptionist"
- **Style**: Small, muted, centered

## Widget Functionality:

### Send Message Flow:

1. **User types message** → Clicks send

2. **Create user message object**:
   ```javascript
   {
     role: "user",
     content: "user message",
     timestamp: new Date()
   }
   ```

3. **Add to messages array** (optimistic)

4. **Call widget-chat edge function**:
   - **URL**: `/functions/v1/widget-chat`
   - **Payload**:
     ```json
     {
       "message": "user message",
       "receptionistId": "...",
       "sessionId": "session_123..."
     }
     ```

5. **Edge function processes**:
   - Loads receptionist
   - Loads FAQs
   - Calls AI model
   - Logs to conversations table

6. **Receives response**:
   ```json
   {
     "reply": "AI response",
     "receptionistName": "Sarah",
     "businessName": "Sunshine Dental"
   }
   ```

7. **Add assistant message**:
   ```javascript
   {
     role: "assistant",
     content: "AI response",
     timestamp: new Date()
   }
   ```

### Session Management:

**Session ID**: Generated on widget load
- **Format**: `session_{timestamp}_{random}`
- **Purpose**: Group messages from same conversation
- **Stored**: In widget state, not persisted across refreshes

## Error States:

### Invalid/Missing Receptionist ID:
**Display**:
- **Icon**: MessageCircle (large)
- **Title**: "Invalid Widget Link"
- **Message**: "This chat widget link is not properly configured. Please contact the business owner."

### Receptionist Not Found:
**Display**:
- **Loader**: Spinning while checking
- **Error**: If receptionist doesn't exist or is inactive

## Purpose & Connections:

**Purpose**: Customer-facing chat interface for booking appointments

**Connections**:
- **Loads**: Receptionist data from `receptionists` table
- **Calls**: `widget-chat` edge function
- **Creates**: Records in `conversations` table
- **Can trigger**: Appointment booking flow
- **Embedded in**: Business website via iframe

**Data Flow**:
1. Business owner gets embed code from Builder
2. Adds iframe to their website
3. Customer visits website, sees widget
4. Customer clicks, chat opens
5. Customer asks questions → AI answers using FAQs
6. Customer requests appointment → booking flow starts
7. Appointment created → shows in business calendar
8. Conversation logged → shows in Conversations page

---

# ✅ APPOINTMENT CONFIRMATION PAGE
**Route**: `/appointments/confirm?token={TOKEN}`
**Component**: `ConfirmAppointment.tsx`
**Access**: Public (no authentication required)

## Page Loading:

**On Mount**:
1. **Read URL Parameter**: `token`
2. **Load Appointment**:
   ```sql
   SELECT * FROM appointments
   WHERE metadata->>'confirmation_token' = token
   ```
3. **If not found**: Show error
4. **If already confirmed**: Show success (already done)
5. **If found**: Show confirmation form

## Loading State:
- **Display**: Spinning loader (centered)

## Error State:
**Card containing**:
- **Icon**: XCircle (red)
- **Title**: "Error"
- **Message**: Error reason
  - "Invalid confirmation link"
  - "Appointment not found"

## Success State (Already Confirmed):
**Card containing**:
- **Icon**: CheckCircle (green)
- **Title**: "Appointment Confirmed!"
- **Description**: "Your appointment has been successfully confirmed"

**Appointment Details Box**:
- **Service**: "{service}"
- **Date**: "December 23, 2024"
- **Time**: "2:00 PM"
- **Customer**: "{customer_name}"

**Reminder Text**: "You will receive a reminder 24 hours before your appointment."

## Confirmation Form State:

**Card containing**:

### Header:
- **Icon**: Calendar (primary)
- **Title**: "Confirm Your Appointment"
- **Description**: "Please confirm your appointment details below"

### Appointment Details Box:
**Background**: Muted
**Border Radius**: Rounded

**Details Displayed**:
- **Service**: Bold label + value
- **Date**: Full format "Wednesday, December 25, 2024"
- **Time**: "2:00 PM" format
- **Customer**: Name
- **Phone**: If provided
- **Email**: If provided

### Confirm Button:
- **Text**: "Confirm Appointment" (or "Confirming..." when processing)
- **Icon**: CheckCircle
- **Style**: Primary, large, full width
- **Action**: Confirms appointment

**Confirmation Handler**:
1. **Calls**: `appointment-action` edge function
   - **Payload**:
     ```json
     {
       "appointmentId": "...",
       "action": "confirm",
       "token": "..."
     }
     ```

2. **Edge function**:
   - Validates token
   - Updates appointment status
   - Logs action
   - Creates notification

3. **On success**: Shows success state

### Footer Text:
"By confirming, you agree to attend this appointment at the scheduled time."

## Purpose & Connections:

**Purpose**: Customer confirms their booked appointment

**Connections**:
- **Data from**: `appointments` table
- **Calls**: `appointment-action` edge function
- **Updates**: Appointment status
- **Creates**: Notification for business owner
- **Creates**: Log in `appointment_logs` table
- **Accessed via**: Confirmation link sent after booking

---

# ❌ APPOINTMENT CANCELLATION PAGE
**Route**: `/appointments/cancel?token={TOKEN}`
**Component**: `CancelAppointment.tsx`
**Access**: Public (no authentication required)

## Page Loading:

**On Mount**:
1. **Read URL Parameter**: `token`
2. **Load Appointment**:
   ```sql
   SELECT * FROM appointments
   WHERE metadata->>'cancellation_token' = token
   ```
3. **If not found**: Show error
4. **If already cancelled**: Show error
5. **If found**: Show cancellation form

## States (Same structure as Confirm page):

### Loading State:
- Spinning loader

### Error State:
- **Errors**:
  - "Invalid cancellation link"
  - "Appointment not found"
  - "This appointment has already been cancelled"

### Success State:
**Card containing**:
- **Icon**: CheckCircle (green)
- **Title**: "Appointment Cancelled"
- **Description**: "Your appointment has been successfully cancelled"
- **Appointment Details**: Service, Date, Time
- **Help Text**: "If you'd like to reschedule, please contact the business directly."

## Cancellation Form State:

**Card containing**:

### Header:
- **Icon**: AlertTriangle (red/warning)
- **Title**: "Cancel Appointment"
- **Description**: "Are you sure you want to cancel this appointment?"

### Appointment Details Box:
- Same display as confirmation page

### Cancellation Reason Field:
- **Label**: "Cancellation Reason (Optional)"
- **Type**: Textarea
- **Placeholder**: "Let us know why you're cancelling..."
- **Purpose**: Helps business understand cancellations

### Cancel Button:
- **Text**: "Cancel Appointment" (or "Cancelling..." when processing)
- **Icon**: XCircle
- **Style**: Destructive (red), large, full width
- **Action**: Cancels appointment

**Cancellation Handler**:
1. **Calls**: `appointment-action` edge function
   - **Payload**:
     ```json
     {
       "appointmentId": "...",
       "action": "cancel",
       "token": "...",
       "reason": "customer reason text"
     }
     ```

2. **Edge function**:
   - Validates token
   - Updates appointment status to "cancelled"
   - Logs action with reason
   - Creates notification

3. **On success**: Shows success state

### Warning Text:
"This action cannot be undone. You'll need to book a new appointment if you change your mind."

## Purpose & Connections:

**Purpose**: Customer cancels their booked appointment

**Connections**:
- **Data from**: `appointments` table
- **Calls**: `appointment-action` edge function
- **Updates**: Appointment status to "cancelled"
- **Creates**: Notification for business owner
- **Creates**: Log in `appointment_logs` table
- **Accessed via**: Cancellation link sent after booking

---

# 🔗 COMPLETE FEATURE CONNECTION MAP

## Authentication Flow:
```
Landing (/) 
  → Auth (/auth)
    → Dashboard (/dashboard)
```

## Setup Flow (New User):
```
Dashboard 
  → Onboarding (/onboarding)
    Creates: Receptionist + FAQs
    → Dashboard (shows new receptionist)
      → Builder (/builder/:id)
        Configure: All receptionist settings
        Test: Chat functionality
        Get: Widget embed code
          → Services (/services)
            Add: Bookable services
              → Availability (/availability)
                Set: Business hours
                Set: Time-off exceptions
                  ✅ Setup Complete
```

## Customer Booking Flow:
```
Widget (/widget?rid=...)
  → Customer chats
    → AI processes (FAQs or booking)
      → IF booking:
        → check-availability edge function
          Checks: Services + Availability rules
          → IF available:
            → book-appointment edge function
              Creates: Appointment
              Sends: Confirm + Cancel links
              Creates: Notification
                → Business sees in:
                  - Appointments page
                  - Notifications page
          → IF not available:
            → Offers alternatives
              → Customer books alternative
```

## Appointment Lifecycle:
```
Appointment Created (via chat)
  → Customer receives:
    - Confirmation link (/appointments/confirm?token=...)
    - Cancellation link (/appointments/cancel?token=...)
  → 24h before:
    - send-reminder edge function
      Creates: Notification
      Shows: Browser push (if enabled)
  → Customer confirms OR cancels:
    - appointment-action edge function
      Updates: Status
      Creates: Notification
  → Business monitors:
    - Appointments page (calendar view)
    - Notifications page (alerts)
```

## Data Flow Between Features:

### Receptionist → Everything:
- **Services**: Linked via `receptionist_id`
- **Availability**: Rules per receptionist
- **FAQs**: Per receptionist
- **Conversations**: Tagged with receptionist
- **Appointments**: Booked by specific receptionist
- **Chat Messages**: Per receptionist
- **AI Responses**: Quality tracked per receptionist

### Services → Booking:
- **Provides**: Available services to book
- **Defines**: Duration + buffer times
- **Used by**: Chat AI to offer options
- **Used by**: Availability checker for time slots

### Availability → Booking:
- **Provides**: Valid time ranges
- **Blocks**: Exceptions (holidays)
- **Used by**: check-availability to find slots
- **Used by**: Chat AI to offer times

### Appointments → Monitoring:
- **Shows in**: Calendar view
- **Triggers**: Notifications
- **Creates**: Logs (action history)
- **Links to**: Services, Receptionists

### Conversations → Quality:
- **Logged by**: All chat interactions
- **Used by**: Quality Review page
- **Used by**: Analytics
- **Filtered by**: Receptionist

## Navigation Connections:

### From Dashboard, quick access to:
1. **Conversations** - View chats
2. **Appointments** - See bookings
3. **Analytics** - Performance data
4. **Quality Review** - AI response quality
5. **Services** - Manage offerings
6. **Availability** - Set hours

### From Builder:
1. **Configure** - Receptionist settings
2. **Test** - Chat preview
3. **FAQs** - Manage questions
4. **Embed** - Get widget code

### From Sidebar (always accessible):
- All main features
- Always visible navigation
- Current page highlighted

---

# 📊 COMPLETE DATA RELATIONSHIPS

## Core Tables & Connections:

```
users (auth.users - Supabase managed)
  ↓ (user_id)
profiles
  ↓ (user_id)
receptionists
  ├─→ receptionist_faqs (receptionist_id)
  ├─→ services (receptionist_id)
  ├─→ availability_rules (receptionist_id)
  ├─→ availability_exceptions (receptionist_id)
  ├─→ appointments (receptionist_id)
  ├─→ conversations (receptionist_id)
  ├─→ chat_messages (receptionist_id)
  ├─→ ai_responses (receptionist_id)
  └─→ notifications (receptionist_id)

appointments
  ├─→ service (service_id) [optional]
  ├─→ appointment_logs (appointment_id)
  └─→ notifications (when created/updated)
```

---

# 🎯 COMPLETE FEATURE PURPOSE SUMMARY

Every feature serves the central goal: **AI-powered appointment booking**

1. **Authentication** - Controls access, security
2. **Dashboard** - Central hub, overview, navigation
3. **Onboarding** - First-time setup, quick start
4. **Builder** - Configure AI, test chat, get embed code
5. **FAQs** - Instant answers, reduces AI load
6. **Widget Embed** - Deploy to website
7. **Services** - Define what can be booked
8. **Availability** - Define when it can be booked
9. **Widget** - Customer interface for booking
10. **Chat Processing** - AI conversation + booking logic
11. **Appointments** - View bookings in calendar
12. **Conversations** - Monitor all interactions
13. **Notifications** - Real-time alerts
14. **Confirm/Cancel** - Customer appointment management
15. **Reminders** - Automated appointment alerts
16. **Settings** - Account configuration
17. **Analytics** - Performance tracking
18. **Quality Review** - AI response improvement

Every button, field, and flow contributes to this ecosystem, creating a complete, connected platform for AI-powered appointment scheduling.
