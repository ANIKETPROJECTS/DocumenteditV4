import { MongoClient } from "mongodb";

async function test() {
  const uri = "mongodb://root:ATtech%40132231@168.231.120.239:27017/bg_remover_portal?authSource=admin&directConnection=true&serverSelectionTimeoutMS=5000";
  console.log("Testing connection to:", uri.replace(/:([^@]+)@/, ":****@"));
  
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connection successful!");
    const db = client.db("bg_remover_portal");
    const count = await db.collection("image_requests").countDocuments();
    console.log("Found", count, "documents");
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await client.close();
  }
}

test();
