import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

// CONFIGURATION

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const WEBHOOK_URL = process.env.WEBHOOK_URL;

const CSV_FILE_PATH = './sample_leads.csv';

const CONCURRENCY = 5; // Max parallel AI classification requests

// CONCURRENCY HELPER

async function runWithConcurrency(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// CSV READER MODULE

function readCSV(filePath) {
  console.log('\n📂 Reading CSV file...');

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    console.log(`✅ Successfully read ${records.length} leads from CSV`);
    return records;
  } catch (error) {
    console.error('❌ Error reading CSV:', error.message);
    throw error;
  }
}

// BATCH DUPLICATE CHECKER MODULE

async function filterDuplicates(leads) {
  console.log('\n🔍 Checking for duplicates...');

  try {
    const emails = leads.map(lead => lead['Email']);
    const { data, error } = await supabase
      .from('leads')
      .select('email')
      .in('email', emails);

    if (error) {
      console.error('Error checking duplicates:', error.message);
      return { newLeads: leads, duplicateCount: 0 };
    }

    const existingEmails = new Set(data.map(row => row.email));
    const newLeads = [];
    let duplicateCount = 0;

    for (const lead of leads) {
      if (existingEmails.has(lead['Email'])) {
        console.log(`⏭️  SKIPPED - ${lead['First Name']} ${lead['Last Name']} (already in database)`);
        duplicateCount++;
      } else {
        newLeads.push(lead);
      }
    }

    console.log(`✅ Found ${duplicateCount} duplicates, ${newLeads.length} new leads to process`);
    return { newLeads, duplicateCount };
  } catch (error) {
    console.error('Error in duplicate check:', error.message);
    return { newLeads: leads, duplicateCount: 0 };
  }
}

// LLM CLASSIFICATION MODULE

async function classifyLead(lead) {
  const prompt = `You are a lead classification expert for a beverage supply company.

Classify this lead into EXACTLY ONE persona based on their job title and company context.

Lead Information:
- Name: ${lead['First Name']} ${lead['Last Name']}
- Job Title: ${lead['Job Title']}
- Company: ${lead['Company']}

Classification Rules:
- Persona 1: Owners of bars, restaurants, or hotels that sell cocktails or lemonades (Owner, Proprietor, Founder, Co-owner, CEO of hospitality venue)
- Persona 2: Beverage directors, bar managers, or anyone directly responsible for beverage operations (Beverage Director, Bar Manager, Sommelier, Head Bartender, Mixologist, Beverage Operations Manager)
- Persona 3: Purchasing directors, purchasing managers, or anyone who works on managing purchases, sourcing, and procurement (Purchasing Manager/Director, Procurement Manager, Supply Chain Manager, Vendor Relations Manager)
- Persona 4: Anyone who works at the company but has no direct purchasing power and is not involved in beverage operations (Marketing, HR, Accounting, IT, Admin, Front Desk, Events)

IMPORTANT:
- Respond with ONLY the persona number: "Persona 1", "Persona 2", "Persona 3", or "Persona 4"
- Do not include any explanation or additional text
- If a title includes both ownership and beverage operations (e.g., "General Manager & Owner"), classify as Persona 1 (ownership takes priority)`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const classification = message.content[0].text.trim();

    // Validate the response
    if (!classification.match(/Persona [1-4]/)) {
      console.warn(`⚠️  Unexpected classification for ${lead['First Name']} ${lead['Last Name']}: "${classification}". Defaulting to Persona 4.`);
      return 'Persona 4';
    }

    return classification;
  } catch (error) {
    console.error(`❌ Error classifying ${lead['First Name']} ${lead['Last Name']}:`, error.message);
    return 'Persona 4'; // Default to Persona 4 on error
  }
}

// PARALLEL CLASSIFICATION MODULE

async function classifyLeads(leads) {
  console.log(`\n🤖 Classifying ${leads.length} leads with Claude AI (concurrency: ${CONCURRENCY})...`);

  const classified = await runWithConcurrency(leads, CONCURRENCY, async (lead) => {
    const persona = await classifyLead(lead);
    console.log(`   ✅ ${lead['First Name']} ${lead['Last Name']} (${lead['Job Title']}) → ${persona}`);
    return { lead, persona };
  });

  console.log(`✅ All ${classified.length} leads classified`);
  return classified;
}

// BATCH DATABASE WRITER MODULE

async function addLeadsToDatabase(classifiedLeads) {
  console.log(`\n💾 Inserting ${classifiedLeads.length} leads into database...`);

  const rows = classifiedLeads.map(({ lead, persona }) => ({
    first_name: lead['First Name'],
    last_name: lead['Last Name'],
    job_title: lead['Job Title'],
    company: lead['Company'],
    email: lead['Email'],
    phone: lead['Phone'],
    persona: persona,
    lead_status: 'Not Contacted'
  }));

  try {
    const { error } = await supabase
      .from('leads')
      .insert(rows);

    if (error) {
      console.error('❌ Database batch insert error:', error.message);
      return { success: false, count: 0 };
    }

    console.log(`✅ Inserted ${rows.length} leads into database`);
    return { success: true, count: rows.length };
  } catch (error) {
    console.error('❌ Error adding to database:', error.message);
    return { success: false, count: 0 };
  }
}

// PARALLEL WEBHOOK SENDER MODULE

async function sendLeadsToWebhook(classifiedLeads) {
  console.log(`\n📤 Sending ${classifiedLeads.length} leads to webhook (concurrency: ${CONCURRENCY})...`);

  let successCount = 0;
  let failCount = 0;

  await runWithConcurrency(classifiedLeads, CONCURRENCY, async ({ lead, persona }) => {
    try {
      const payload = {
        first_name: lead['First Name'],
        last_name: lead['Last Name'],
        job_title: lead['Job Title'],
        company: lead['Company'],
        email: lead['Email'],
        phone: lead['Phone'],
        persona: persona,
        processed_at: new Date().toISOString()
      };

      const response = await axios.post(WEBHOOK_URL, payload);

      if (response.status === 200 || response.status === 201) {
        successCount++;
      } else {
        console.warn(`⚠️  Webhook returned status ${response.status} for ${lead['Email']}`);
        failCount++;
      }
    } catch (error) {
      console.error(`❌ Webhook error for ${lead['Email']}:`, error.message);
      failCount++;
    }
  });

  console.log(`✅ Webhook: ${successCount} sent, ${failCount} failed`);
  return { successCount, failCount };
}

// MAIN FUNCTION

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 LEAD CLASSIFICATION AUTOMATION');
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    // Read CSV
    const leads = readCSV(CSV_FILE_PATH);

    console.log('\n' + '='.repeat(60));
    console.log('📊 PROCESSING LEADS');
    console.log('='.repeat(60));

    // Batch duplicate check (1 query instead of N)
    const { newLeads, duplicateCount } = await filterDuplicates(leads);

    if (newLeads.length === 0) {
      console.log('\n⏭️  All leads are duplicates. Nothing to process.');
      return;
    }

    // Parallel AI classification
    const classifiedLeads = await classifyLeads(newLeads);

    // Batch database insert (1 query instead of N)
    const dbResult = await addLeadsToDatabase(classifiedLeads);

    // Parallel webhook sends
    const webhookResult = await sendLeadsToWebhook(classifiedLeads);

    // Build persona counts
    const byPersona = { 'Persona 1': 0, 'Persona 2': 0, 'Persona 3': 0, 'Persona 4': 0 };
    for (const { persona } of classifiedLeads) {
      byPersona[persona]++;
    }

    // Display summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('📈 AUTOMATION COMPLETE - SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n📊 Total leads in CSV: ${leads.length}`);
    console.log(`✅ Successfully processed: ${dbResult.count}`);
    console.log(`⏭️  Skipped (duplicates): ${duplicateCount}`);
    console.log(`❌ Failed DB inserts: ${dbResult.success ? 0 : newLeads.length}`);
    console.log(`📤 Webhook: ${webhookResult.successCount} sent, ${webhookResult.failCount} failed`);

    console.log('\n📋 Classification Breakdown:');
    console.log(`   Persona 1 (Owners): ${byPersona['Persona 1']}`);
    console.log(`   Persona 2 (Beverage Ops): ${byPersona['Persona 2']}`);
    console.log(`   Persona 3 (Procurement): ${byPersona['Persona 3']}`);
    console.log(`   Persona 4 (Other Staff): ${byPersona['Persona 4']}`);

    console.log(`\n⏱️  Completed in ${elapsed}s`);
    console.log('✅ Automation finished successfully!\n');

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the automation
main();