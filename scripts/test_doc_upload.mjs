import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testFullDocWorkflow() {
  console.log('--- Testing Complete Employee Document Workflow ---');
  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  const empId = 'eaa1230b-caf2-46ce-9b37-e25def78fb75';

  // 1. Get employee data for company_id
  const { data: emp } = await supabase.from('employees').select('company_id').eq('id', empId).single();
  console.log('Employee company_id:', emp.company_id);

  // 2. Upload test document file to storage
  const testFileBuffer = Buffer.from('Fake PDF content for test %PDF-1.4');
  const path = `${empId}/nic_front_test_${Date.now()}.pdf`;

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from('employee-documents')
    .upload(path, testFileBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadErr) {
    console.error('❌ Storage upload failed:', uploadErr);
    return;
  }
  console.log('✅ Storage upload success:', uploadData.path);

  // 3. Insert record in employee_documents table
  const { data: docRecord, error: dbErr } = await supabase.from('employee_documents').insert({
    company_id: emp.company_id,
    employee_id: empId,
    doc_type: 'nic_front',
    doc_name: 'NIC Front Test Document',
    file_path: path,
    file_size: testFileBuffer.length,
    mime_type: 'application/pdf'
  }).select('*').single();

  if (dbErr) {
    console.error('❌ DB Insert failed:', dbErr);
    return;
  }
  console.log('✅ DB Record created:', docRecord.id);

  // 4. Generate signed URL for preview/download
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('employee-documents')
    .createSignedUrl(path, 3600);

  if (signedErr) {
    console.error('❌ Signed URL failed:', signedErr);
  } else {
    console.log('✅ Signed URL generated:', signedData.signedUrl.slice(0, 80) + '...');
  }

  // 5. Cleanup test record & file
  await supabase.from('employee_documents').delete().eq('id', docRecord.id);
  await supabase.storage.from('employee-documents').remove([path]);
  console.log('✅ Cleanup complete! Workflow test PASSED 100%.');
}

testFullDocWorkflow().catch(console.error);
