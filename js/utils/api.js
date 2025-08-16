'use strict';

// Expect the Supabase UMD script to be loaded on pages that need it:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// Configure these via environment or replace placeholders below.
const SUPABASE_URL = 'https://qwweyhrftpdkfxqoablb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3d2V5aHJmdHBka2Z4cW9hYmxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNjIzNDUsImV4cCI6MjA3MDkzODM0NX0.m8Yu_KHYzwZxvClhlC-ROkVU52rT4NNtwnrj2jsV6D0';

let _client = null;
function getClient(){
  if (_client) return _client;
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Supabase JS not loaded. Include @supabase/supabase-js UMD on this page.');
  }
  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
  });
  return _client;
}

async function getSession(){
  const { data, error } = await getClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

async function getUser(){
  const { data, error } = await getClient().auth.getUser();
  if (error) throw error;
  return data.user;
}

function redirect(path){ window.location.href = path; }

window.AppAPI = {
  getClient,
  getSession,
  getUser,
  redirect,
};
