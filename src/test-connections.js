import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

// Test Supabase
async function testSupabase() {
  console.log('Testing Supabase...');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  
  try {
    const { data, error, count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.log('❌ Supabase Error:', error.message);
    } else {
      console.log('✅ Supabase Connected! Database is ready.');
    }
  } catch (err) {
    console.log('❌ Supabase Error:', err.message);
  }
}

// Test Claude API
async function testClaude() {
  console.log('Testing Claude API...');
  
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('❌ Claude API Key not found in .env file!');
    return;
  }
  
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  
  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'Say "API Working!" if you receive this.' }
      ],
    });
    
    console.log('✅ Claude API Connected!', message.content[0].text);
  } catch (error) {
    console.log('❌ Claude API Error:', error.status, error.message);
    console.log('   Check: 1) API key is correct, 2) Billing is set up, 3) Try model: claude-3-haiku-20240307');
  }
}

// Test Webhook
async function testWebhook() {
  console.log('Testing Webhook...');
  
  if (!process.env.WEBHOOK_URL) {
    console.log('❌ Webhook URL not found in .env file!');
    return;
  }
  
  try {
    const response = await axios.post(process.env.WEBHOOK_URL, {
      test: true,
      message: 'Testing webhook connection',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Webhook Connected! Status:', response.status);
  } catch (error) {
    console.log('❌ Webhook Error:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.log('   The webhook URL might be incorrect or unreachable');
    }
  }
}

// Run all tests
async function runTests() {
  console.log('\n🧪 Testing Connections...\n');
  await testSupabase();
  console.log('');
  await testClaude();
  console.log('');
  await testWebhook();
  console.log('\n✅ All tests complete!\n');
}

runTests();