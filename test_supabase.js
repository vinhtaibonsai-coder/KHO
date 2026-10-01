const { createClient } = require("@supabase/supabase-js");

const url = "https://ryyffqehkxqphsxoyoym.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eWZmcWVoa3hxcGhzeG95b3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3OTc5NDUsImV4cCI6MjEwNjM3Mzk0NX0.IXn2HS_dq7eWS6Y-GN8berZXjaO8qNEp0Yi7iz__dRA";

const sb = createClient(url, key);

async function test() {
  console.log("1. Kiểm tra đọc warehouse_items:");
  const readRes = await sb.from("warehouse_items").select("*");
  console.log("Read Result:", JSON.stringify(readRes));

  console.log("2. Kiểm tra ghi vào warehouse_items:");
  const insertRes = await sb.from("warehouse_items").upsert({
    sku: "E120.124",
    name: "Hàng độc bản",
    warehouse: 5,
    qty: 1,
    updated_at: new Date().toISOString()
  });
  console.log("Insert Result:", JSON.stringify(insertRes));
}

test().catch(console.error);
