# Lead Classification Automation

Automated lead classification system using AI (Claude) and Supabase database integration.

## Overview

This automation:

1. ✅ Reads leads from CSV file
2. ✅ Checks for duplicates in database
3. ✅ Classifies leads using Claude AI into 4 personas
4. ✅ Stores new leads in Supabase database
5. ✅ Sends results to webhook

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file with:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=your_claude_api_key
WEBHOOK_URL=https://n8n.srv1062902.hstgr.cloud/webhook/6fb62d67-1beb-4750-83e8-c55f8129affb
```

### 3. Place CSV File

Put `sample_leads.csv` in the project root directory.

## Usage

### Test Connections

```bash
npm test
```

This verifies:

- Supabase database connection
- Claude API access
- Webhook endpoint

### Run Automation

```bash
npm start
```

This will:

- Read all leads from `sample_leads.csv`
- Skip any duplicates already in database
- Classify new leads with AI
- Add them to Supabase
- Send data to webhook

## Persona Classification

The AI classifies leads into 4 personas:

- **Persona 1**: Owners (Owner, Founder, CEO of hospitality venues)
- **Persona 2**: Beverage Operations (Beverage Director, Bar Manager, Mixologist)
- **Persona 3**: Procurement (Purchasing Manager, Supply Chain Manager)
- **Persona 4**: Other Staff (Marketing, HR, Accounting, Admin)

## Architecture

```
Node.js Application
├── Supabase (PostgreSQL database)
├── Claude API (AI classification)
└── Webhook (n8n endpoint)
```

## Database Schema

```sql
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  job_title VARCHAR(200),
  company VARCHAR(200),
  email VARCHAR(200) UNIQUE,
  phone VARCHAR(50),
  persona VARCHAR(20),
  lead_status VARCHAR(50) DEFAULT 'Not Contacted',
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Project Structure

```
lead-classification-automation/
├── src/
│   ├── index.js              # Main automation script
│   └── test-connections.js   # Connection testing
├── sample_leads.csv          # Input data
├── .env                      # Environment variables (not in repo)
├── package.json              # Dependencies
└── README.md                 # This file
```

## Author

Built for GTM Automation Trial Task
