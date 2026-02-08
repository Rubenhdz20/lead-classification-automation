# 🚀 Lead Classification Automation

An intelligent lead classification system that uses AI to automatically categorize business contacts into personas, with duplicate detection and webhook integration.

**Built for:** GTM Automation Trial Task  
**Developer:** Ruben Hdz  
**Tech Stack:** Node.js, Supabase (PostgreSQL), Claude AI (Anthropic), Webhook Integration

---

## 📋 Overview

This automation processes incoming leads from CSV files and:
- ✅ Detects and skips duplicates from existing database
- ✅ Classifies leads into 4 business personas using Claude AI
- ✅ Stores results in Supabase (PostgreSQL) database
- ✅ Sends data to webhook endpoint for downstream processing
- ✅ Executes in ~8-12 seconds using batch operations and parallel processing

---

## 🎯 Features

### Intelligent Classification
Uses Claude AI (Haiku model) to classify leads into:
- **Persona 1:** Owners (Bar/Restaurant/Hotel owners)
- **Persona 2:** Beverage Operations (Directors, Managers, Bartenders)
- **Persona 3:** Procurement (Purchasing, Supply Chain, Vendor Relations)
- **Persona 4:** Other Staff (Marketing, HR, Finance, IT)

### Performance Optimizations
- **Batch duplicate checking:** Single database query for all leads
- **Parallel AI classification:** Process 5 leads simultaneously
- **Batch database insertion:** Single INSERT operation for all new leads
- **Parallel webhook delivery:** Concurrent HTTP requests

### Error Handling
- Graceful failure recovery
- Detailed logging and progress tracking
- Input validation and response verification

---

## 🏗️ Architecture

```
CSV File Input
      ↓
┌─────────────────────────────────────┐
│  Node.js Automation Script          │
├─────────────────────────────────────┤
│  1. CSV Reader                      │
│  2. Batch Duplicate Checker         │
│  3. Parallel AI Classification      │
│  4. Batch Database Writer           │
│  5. Parallel Webhook Sender         │
└─────────────────────────────────────┘
      ↓                    ↓
  Supabase DB         Webhook Endpoint
  (PostgreSQL)        (n8n)
```

---

## 🛠️ Tech Stack

| Component | Technology | Reason |
|-----------|------------|--------|
| Runtime | Node.js | Efficient for API integrations |
| Database | Supabase (PostgreSQL) | Production-ready, scalable |
| AI | Claude API (Haiku) | Cost-efficient, accurate classification |
| HTTP Client | Axios | Reliable webhook delivery |
| CSV Parser | csv-parse | Fast, stream-based parsing |

---

## 📦 Installation

### Prerequisites
- Node.js 16+ installed
- Supabase account
- Claude API key (Anthropic)

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lead-classification-automation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your_anon_key
   ANTHROPIC_API_KEY=sk-ant-xxxxx
   WEBHOOK_URL=https://your-webhook-endpoint
   ```

4. **Set up Supabase database**
   
   Run this SQL in Supabase SQL Editor:
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

5. **Place CSV file**
   ```bash
   # Add your sample_leads.csv to project root
   ```

---

## 🚀 Usage

### Test Connections
```bash
npm test
```

### Run Automation
```bash
npm start
```

### Reset Database
```bash
npm run reset
```

---

## 📁 Project Structure

```
lead-classification-automation/
├── src/
│   ├── index.js              # Main automation script
│   ├── test-connections.js   # Connection testing
├── .env.example              # Environment template
├── package.json              # Dependencies
└── README.md                 # Documentation
```

---

## ⚡ Performance

**Execution Time:** ~8-12 seconds for 17 new leads

**Optimizations:**
- Batch database queries (26 queries → 1 query)
- Parallel AI classification (5 concurrent requests)
- Batch database inserts (18 inserts → 1 insert)
- Parallel webhook delivery (5 concurrent requests)

---

## 📊 Classification Logic

| Persona | Description | Example Titles |
|---------|-------------|----------------|
| Persona 1 | Business owners | Owner, Founder, Co-owner, CEO |
| Persona 2 | Beverage operations | Beverage Director, Bar Manager, Sommelier |
| Persona 3 | Procurement | Purchasing Manager, Supply Chain Manager |
| Persona 4 | Other staff | Marketing, HR, Finance, IT, Admin |

---

## 🚀 Future Enhancements

Potential improvements for production deployment:

- **TypeScript Migration**: Add type safety and better IDE support for team collaboration
- **Unit Testing**: Implement Jest for automated testing of core functions
- **Retry Logic**: Add exponential backoff for webhook calls to handle network failures
- **Monitoring**: Integrate logging and alerting for production observability
- **Containerization**: Create Docker image for consistent deployment across environments

---

## 👤 Author

**Ruben Hernandez** - Built for GTM Automation Trial Task

---