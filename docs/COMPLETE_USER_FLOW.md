# Complete User Flow - AI Receptionist Platform

## Overview
This document outlines the complete, connected flow of the AI Receptionist platform from business owner setup to customer interaction.

---

## 🔐 Authentication Flow

### Landing Page (`/`)
- Unauthenticated users see Landing page
- Redirects to `/auth` for sign-up/login
- After auth, redirects to `/dashboard`

### Auth Page (`/auth`)
- Email/password authentication via Supabase
- After successful auth, redirects to dashboard

---

## 👔 Business Owner Flow

### 1. Onboarding (`/onboarding`)
**Purpose**: First-time setup wizard

**Steps**:
1. **Basic Info** - Business name, receptionist name, tone selection
2. **Template Selection** - Choose industry template (Clinic, Salon, Contractor, Dental)
3. **Preview & Publish** - Review greeting, publish receptionist with FAQs

**Output**: 
- Creates receptionist in database
- Creates pre-configured FAQs based on template
- Marks onboarding as complete
- Redirects to dashboard

### 2. Dashboard (`/dashboard`)
**Purpose**: Central hub and overview

**Features**:
- Statistics cards (Conversations, Appointments, Active Receptionists)
- List of all receptionists with edit buttons
- Quick actions to:
  - Conversations page
  - Appointments calendar
  - Analytics
  - Quality Review
- Setup quick actions (Services, Availability)

**Getting Started Guide** (shown if no receptionists exist):
- Step-by-step checklist
- Guides user through complete setup process

### 3. Builder Page (`/builder/:id`)
**Purpose**: Create, configure, and test AI receptionists

**Features**:
- **Receptionist Configuration**:
  - Name, business details, phone
  - Tone of voice
  - Greeting message, default response
  - Knowledge base
  - System prompt
  
- **Live Chat Testing**:
  - Test conversations in real-time
  - See AI responses
  - Book test appointments
  - Handle alternative time slots
  
- **FAQ Management**:
  - Add/edit/delete FAQs
  - Set priority
  
- **Widget Embed Code**:
  - Direct link to widget
  - Copy embed code for website
  - Instructions for implementation

**Analytics Panel**:
- Shows real-time metrics for this receptionist
- Response quality scores
- Conversation counts

### 4. Services Page (`/services`)
**Purpose**: Manage bookable services

**Features**:
- **Receptionist Selector**: Choose which receptionist to manage services for
- Create services with:
  - Name, description
  - Duration (minutes)
  - Buffer before/after (setup/cleanup time)
- Activate/deactivate services
- Delete services

**Connection**: Services are linked to specific receptionists via `receptionist_id`

### 5. Availability Page (`/availability`)
**Purpose**: Set business hours and time-off

**Features**:
- **Receptionist Selector**: Choose which receptionist
- **Weekly Schedule**:
  - Set hours per day of week
  - Multiple time blocks per day
  - Timezone selection
  - Quick setup (Mon-Fri 9am-5pm)
  
- **Exceptions**:
  - Block specific dates/times
  - Holidays, vacations
  - Custom reason field

**Connection**: Rules linked to specific receptionists

### 6. Appointments Calendar (`/appointments`)
**Purpose**: View all booked appointments

**Features**:
- **Receptionist Filter**: View all or filter by specific receptionist
- Calendar view of all appointments
- Shows:
  - Service name
  - Customer details
  - Time slots
  - Status (booked/cancelled/completed)
- Refresh button

**Data Source**: Shows appointments created via AI chat booking

### 7. Conversations Page (`/conversations`)
**Purpose**: Review all AI chat interactions

**Features**:
- **Receptionist Filter**: View all or filter by specific receptionist
- Shows conversation history:
  - Customer message
  - AI response
  - Timestamp
  - Direction (inbound/outbound)
  - Receptionist name/business

**Connection**: Linked to specific receptionists

### 8. Notifications Page (`/notifications`)
**Purpose**: View system notifications

**Features**:
- Real-time notification feed
- Browser push notifications (with permission)
- Types:
  - Appointment booked
  - Appointment cancelled
  - Appointment reminders
  - Quality issues
  - System alerts
- Mark as read/unread
- Delete notifications

### 9. Settings Page (`/settings`)
**Purpose**: Account and system configuration

**Tabs**:
- **Account**: Profile info, timezone, email
- **Notifications**: Toggle push/email notifications, test button
- **Integrations**: Connect external services

---

## 👤 Customer Flow

### 1. Widget Landing (`/widget?rid=RECEPTIONIST_ID`)
**Purpose**: Public-facing chat interface

**Features**:
- Clean chat interface
- Shows receptionist name and business
- Real-time messaging
- Booking detection and flow

**How Customers Find It**:
- Direct link shared by business
- Embedded widget on business website
- QR codes

### 2. Chat Interaction
**Customer Actions**:
1. Start conversation
2. Ask questions (answered via FAQs or AI)
3. Request appointment booking
4. Provide:
   - Desired service
   - Date and time preference
   - Contact information (name, phone, email)

**AI Receptionist Actions**:
- Greets customer
- Answers FAQs instantly
- Handles booking flow:
  - Checks availability
  - Offers alternative times if needed
  - Confirms booking details
  - Creates appointment
  - Sends confirmation

### 3. Appointment Confirmation (`/appointments/confirm?token=TOKEN`)
**Purpose**: Customer confirms their booked appointment

**Features**:
- Shows full appointment details
- Confirm button
- Success confirmation message

**Trigger**: Customer receives confirmation link after booking

### 4. Appointment Cancellation (`/appointments/cancel?token=TOKEN`)
**Purpose**: Customer cancels their appointment

**Features**:
- Shows appointment details
- Optional cancellation reason
- Cancel button
- Success confirmation message

**Trigger**: Customer receives cancellation link with appointment

### 5. Appointment Reminders
**Purpose**: Automated reminders before appointments

**How It Works**:
1. Edge function: `send-reminder`
2. Creates in-app notification
3. Browser push notification (if enabled)
4. Sent 24 hours before appointment

**Note**: Requires scheduler setup (see APPOINTMENT_REMINDERS.md)

---

## 🔄 Data Flow Connections

### Receptionist → Services
- Each service is linked to a receptionist via `receptionist_id`
- Booking flow uses receptionist's services

### Receptionist → Availability
- Availability rules linked to receptionist
- AI checks rules before offering appointment times

### Receptionist → FAQs
- FAQs specific to each receptionist
- Used in chat responses

### Receptionist → Conversations
- All chat messages tagged with `receptionist_id`
- Allows filtering by receptionist

### Receptionist → Appointments
- Appointments linked to receptionist
- Shows which AI booked what

### Appointments → Notifications
- Creates notification when appointment booked/cancelled
- Sends to business owner's notification feed

---

## 📊 Analytics & Quality

### Quality Review Page (`/quality-review`)
- Reviews AI response quality
- Flags issues
- Suggests improvements

### Analytics Page (`/analytics`)
- Performance metrics
- Conversion rates
- Response times
- Booking success rates

---

## 🔧 Technical Flow

### Edge Functions

1. **chat** - Main AI chat handler with booking detection
2. **widget-chat** - Public widget chat (simplified)
3. **check-availability** - Checks available time slots
4. **book-appointment** - Creates appointments
5. **appointment-action** - Confirm/cancel appointments
6. **send-reminder** - Sends appointment reminders
7. **create-notification** - Creates notifications

### Database Tables

Key relationships:
```
users (auth)
  └─> profiles
      └─> receptionists
          ├─> receptionist_faqs
          ├─> services
          ├─> availability_rules
          ├─> availability_exceptions
          ├─> appointments
          ├─> conversations
          └─> notifications
```

---

## ✅ Complete Setup Checklist

For business owners:

1. ✅ Sign up / Login
2. ✅ Complete onboarding wizard
3. ✅ Add services (with duration and buffers)
4. ✅ Set business hours (availability rules)
5. ✅ Test chat in Builder
6. ✅ Customize FAQs
7. ✅ Copy widget embed code
8. ✅ Add widget to website
9. ✅ Monitor conversations and appointments
10. ✅ Review analytics and quality

---

## 🎯 Key Success Metrics

- Conversations started
- Questions answered
- Appointments booked
- Appointment confirmation rate
- Cancellation rate
- Average response quality
- Customer satisfaction

---

## 🚀 Next Steps for Enhancement

1. **Email Notifications** - Add email alongside in-app notifications
2. **SMS Integration** - Text reminders to customers
3. **Calendar Sync** - Sync with Google Calendar, Outlook
4. **Advanced Analytics** - Deeper insights and reporting
5. **Multi-language** - Support multiple languages
6. **Voice Calls** - Handle phone calls with AI
