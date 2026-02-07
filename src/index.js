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

const CSV_FILE_PATH = './sample_leads.csv'; //

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

// DUPLICATE CHECKER MODULE

async function isDuplicate(email) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('email')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error for us)
      console.error('Error checking duplicate:', error.message);
      return false;
    }
    
    return data !== null;
  } catch (error) {
    console.error('Error in duplicate check:', error.message);
    return false;
  }
}

// STEP 2.3: LLM CLASSIFICATION MODULE

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
      console.warn(`⚠️  Unexpected classification format: "${classification}". Defaulting to Persona 4.`);
      return 'Persona 4';
    }
    
    return classification;
  } catch (error) {
    console.error('❌ Error classifying lead:', error.message);
    return 'Persona 4'; // Default to Persona 4 on error
  }
}

// STEP 2.4: DATABASE WRITER MODULE

async function addLeadToDatabase(lead, persona) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .insert([
        {
          first_name: lead['First Name'],
          last_name: lead['Last Name'],
          job_title: lead['Job Title'],
          company: lead['Company'],
          email: lead['Email'],
          phone: lead['Phone'],
          persona: persona,
          lead_status: 'Not Contacted'
        }
      ])
      .select();
    
    if (error) {
      console.error('❌ Database error:', error.message);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error adding to database:', error.message);
    return false;
  }
}

// STEP 2.5: WEBHOOK SENDER MODULE

async function sendToWebhook(lead, persona) {
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
      return true;
    } else {
      console.warn(`⚠️  Webhook returned status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    return false;
  }
}

// MAIN AUTOMATION FLOW

async function processLead(lead, index, total) {
  const leadName = `${lead['First Name']} ${lead['Last Name']}`;
  console.log(`\n[${index + 1}/${total}] Processing: ${leadName} (${lead['Job Title']})`);
  
  // Check for duplicates
  const duplicate = await isDuplicate(lead['Email']);
  
  if (duplicate) {
    console.log(`⏭️  SKIPPED - Already exists in database`);
    return { status: 'skipped', reason: 'duplicate' };
  }
  
  // Classify with AI
  console.log('🤖 Classifying with Claude AI...');
  const persona = await classifyLead(lead);
  console.log(`✅ Classified as: ${persona}`);
  
  // Step 2.4: Add to database
  console.log('💾 Adding to database...');
  const dbSuccess = await addLeadToDatabase(lead, persona);
  
  if (!dbSuccess) {
    console.log('❌ Failed to add to database');
    return { status: 'failed', reason: 'database_error' };
  }
  
  console.log('✅ Added to database');
  
  // Step 2.5: Send to webhook
  console.log('📤 Sending to webhook...');
  const webhookSuccess = await sendToWebhook(lead, persona);
  
  if (webhookSuccess) {
    console.log('✅ Sent to webhook');
  } else {
    console.log('⚠️  Webhook failed (but lead is in database)');
  }
  
  return { 
    status: 'success', 
    persona: persona,
    webhookSuccess: webhookSuccess 
  };
}

// MAIN FUNCTION

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 LEAD CLASSIFICATION AUTOMATION');
  console.log('='.repeat(60));
  
  try {
    // Read CSV
    const leads = readCSV(CSV_FILE_PATH);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 PROCESSING LEADS');
    console.log('='.repeat(60));
    
    const results = {
      total: leads.length,
      processed: 0,
      skipped: 0,
      failed: 0,
      byPersona: {
        'Persona 1': 0,
        'Persona 2': 0,
        'Persona 3': 0,
        'Persona 4': 0
      }
    };
    
    // Process each lead
    for (let i = 0; i < leads.length; i++) {
      const result = await processLead(leads[i], i, leads.length);
      
      if (result.status === 'skipped') {
        results.skipped++;
      } else if (result.status === 'failed') {
        results.failed++;
      } else if (result.status === 'success') {
        results.processed++;
        results.byPersona[result.persona]++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 AUTOMATION COMPLETE - SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n📊 Total leads in CSV: ${results.total}`);
    console.log(`✅ Successfully processed: ${results.processed}`);
    console.log(`⏭️  Skipped (duplicates): ${results.skipped}`);
    console.log(`❌ Failed: ${results.failed}`);
    
    console.log('\n📋 Classification Breakdown:');
    console.log(`   Persona 1 (Owners): ${results.byPersona['Persona 1']}`);
    console.log(`   Persona 2 (Beverage Ops): ${results.byPersona['Persona 2']}`);
    console.log(`   Persona 3 (Procurement): ${results.byPersona['Persona 3']}`);
    console.log(`   Persona 4 (Other Staff): ${results.byPersona['Persona 4']}`);
    
    console.log('\n✅ Automation finished successfully!\n');
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the automation
main();